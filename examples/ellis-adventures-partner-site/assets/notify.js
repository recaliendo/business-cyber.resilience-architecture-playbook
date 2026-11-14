/* Ellis Adventures prototype — automation engine (text + email triggers).
 *
 * Prototype: rules run in the browser and every send is logged + shown as a toast/receipt.
 * Production: the same rules live in the `automation_rules` table. A Supabase Database Webhook
 * fires on INSERT/UPDATE and calls netlify/functions/notify.mjs, which sends SMS through Twilio and
 * email through Resend server-side. The browser never holds a messaging credential.
 */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const { esc, uid, toast, whoLabel } = EA.ui;
  const S = () => EA.store.state;

  const snip = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  /* Templates: sms(ctx) -> string, email(ctx) -> {subject, body}. `partner` variants go to the brand. */
  const T = {
    'inquiry.created': {
      sms: (c) => `✨ New partner inquiry: ${c.company} (${c.category}) · ${c.budget}. ${c.when ? 'Discovery call ' + c.when + '.' : 'No call booked yet.'} Open HQ to reply.`,
      email: (c) => ({ subject: `New partnership inquiry — ${c.company}`, body: `${c.name} from ${c.company} wants to collaborate (${(c.formats || []).join(', ') || 'open to ideas'}). Budget: ${c.budget}. Timeline: ${c.timeline}. Goals: ${snip(c.goals, 200)}` }),
      // Mirrors netlify/functions/notify.ts: never echo submitter-written text back to a form-supplied address.
      partner: (c) => ({ subject: 'We got your note — Kelsey & Zach', body: `Hi there! Thanks for reaching out about a partnership. We were just notified and will reply personally within 48 hours.${c.when ? ' Your discovery call is booked for ' + c.when + '.' : ''}` }),
    },
    'booking.created': {
      sms: (c) => `📅 ${c.company} booked a ${c.typeLabel} with ${c.withLabel} — ${c.when}.`,
      email: (c) => ({ subject: `Booked: ${c.typeLabel} with ${c.company}`, body: `${c.typeLabel} (${c.minutes} min) on ${c.when}. ${c.notes ? 'Notes: ' + snip(c.notes, 160) : ''} Calendar invite attached.` }),
      partner: (c) => ({ subject: `Confirmed: ${c.typeLabel} with ${c.withLabel}`, body: `You’re booked for ${c.when}. A calendar invite and video link are attached.` }),
    },
    'message.received': {
      sms: (c) => `💬 ${c.company} (${c.sender}): “${snip(c.body, 110)}”`,
      email: (c) => ({ subject: `New message from ${c.company}`, body: `${c.sender} wrote in “${c.subject}”: ${snip(c.body, 240)}` }),
    },
    'message.reply': {
      partner: (c) => ({ subject: `${c.sender} replied — ${c.subject}`, body: snip(c.body, 240) }),
    },
    'proposal.submitted': {
      sms: (c) => `📝 ${c.company} ${c.revised ? 'revised' : 'submitted'} a proposal: “${c.title}” · ${c.budget}.`,
      email: (c) => ({ subject: `Proposal ${c.revised ? 'revised' : 'submitted'} — ${c.title}`, body: `${c.company} ${c.revised ? 'sent version ' + c.version : 'sent a new proposal'}. Budget ${c.budget}, timeline ${c.timeline}. Review it in HQ → Proposals.` }),
    },
    'proposal.sent': {
      partner: (c) => ({ subject: `${c.revised ? 'Updated proposal' : 'New proposal'} from Kelsey & Zach: ${c.title}`, body: `${c.actor} ${c.revised ? 'revised' : 'sent you'} “${c.title}” (${c.budget}). Review, comment or accept it in your partner portal.` }),
    },
    'partner.invited': {
      partner: (c) => ({ subject: 'You’re invited to the Ellis Adventures partner portal', body: `Hi ${c.name}! ${c.actor} set up a private workspace for ${c.company}: proposals, collaborations, secure messages and booking — all in one place. Sign in with this email to get started.` }),
    },
    'proposal.decision': {
      email: (c) => ({ subject: `Proposal ${c.decision}: ${c.title}`, body: `${c.actor} marked “${c.title}” as ${c.decision}.${c.decision === 'accepted' ? ' A collaboration has been created in the portal.' : ''}` }),
      partner: (c) => ({ subject: `Proposal ${c.decision}: ${c.title}`, body: `${c.actor} marked “${c.title}” as ${c.decision}. View it in your partner portal.` }),
    },
    'partner.registered': {
      sms: (c) => `🤝 New portal partner: ${c.company} (${c.name}). Verify them in HQ.`,
      email: (c) => ({ subject: `New partner account — ${c.company}`, body: `${c.name} (${c.email}) registered ${c.company} in the partner portal.${c.linked ? ' Linked to their earlier inquiry.' : ''}` }),
    },
    'project.stage': {
      email: (c) => ({ subject: `${c.title} → ${c.stage}`, body: `${c.actor} moved “${c.title}” to ${c.stage}.` }),
      partner: (c) => ({ subject: `Update: ${c.title} is now ${c.stage}`, body: `${c.actor} moved your collaboration to ${c.stage}.` }),
    },
    'idea.trending': {
      email: (c) => ({ subject: c.isNew ? `New idea pitched: ${c.title}` : `Trending idea: ${c.title} (${c.votes} votes)`, body: c.isNew ? `${c.by} pitched “${c.title}” in the Innovation Center.` : `“${c.title}” just passed ${c.votes} partner votes in the Innovation Center.` }),
    },
    'review.pending': {
      email: (c) => ({ subject: `${c.count} new comment${c.count === 1 ? '' : 's'} ready to approve`, body: `New positive Instagram comments passed the sentiment filter. Approve them to show on the site.` }),
    },
  };

  function inQuietHours() {
    const { quietStart: a, quietEnd: b } = S().settings;
    const h = EA.ui.tzParts(new Date()).h;
    return a > b ? h >= a || h < b : h >= a && h < b;
  }

  function addressFor(r, ch, c) {
    const k = S().contacts;
    if (r === 'kelsey' || r === 'zach') return ch === 'sms' ? k[r].sms : k[r].email;
    if (r === 'inbox') return k.inbox.email;
    if (r === 'partner') return ch === 'sms' ? c.partnerPhone : c.partnerEmail;
    return '';
  }

  /**
   * Run the automation rule for `event`. ctx.only narrows creator recipients (e.g. a message to Zach only).
   * Returns the notification records created. Pass ctx.silent to skip the toast (caller shows receipts).
   */
  function dispatch(event, ctx = {}) {
    const st = S();
    const rule = st.automations.find((r) => r.event === event);
    const tpl = T[event];
    if (!rule || !rule.enabled || !tpl) return [];
    const out = [];
    for (const r of rule.to) {
      if ((r === 'kelsey' || r === 'zach') && ctx.only && !ctx.only.includes(r)) continue;
      if (r === 'partner' && !ctx.partnerEmail) continue;
      for (const ch of rule.channels) {
        let content = null;
        if (r === 'partner') {
          if (ch === 'email' && tpl.partner) content = tpl.partner(ctx);
          else if (ch === 'sms' && tpl.partner && ctx.partnerPhone && ctx.partnerSms) content = { body: tpl.partner(ctx).body };
        } else if (r === 'inbox') {
          if (ch === 'email' && tpl.email) content = tpl.email(ctx);
        } else if (ch === 'sms' && tpl.sms) content = { body: tpl.sms(ctx) };
        else if (ch === 'email' && tpl.email) content = tpl.email(ctx);
        if (!content) continue;
        out.push({
          id: uid('n'), at: new Date().toISOString(), event, channel: ch, to: r, address: addressFor(r, ch, ctx),
          subject: content.subject || '', body: content.body, status: ch === 'sms' && inQuietHours() ? 'queued' : 'sent',
        });
      }
    }
    if (!out.length) return out;
    st.notifications.unshift(...out);
    st.notifications.length = Math.min(st.notifications.length, 80);
    EA.store.save();
    EA.store.emit('notify', out);
    if (!ctx.silent) toast(summary(out), { icon: 'zap' });
    return out;
  }

  function summary(list) {
    const smsTo = [...new Set(list.filter((n) => n.channel === 'sms' && (n.to === 'kelsey' || n.to === 'zach')).map((n) => n.to))];
    const emails = list.filter((n) => n.channel === 'email').length;
    const queued = list.some((n) => n.status === 'queued');
    const parts = [];
    if (smsTo.length) parts.push(`📱 Text ${queued ? 'queued for' : 'sent to'} ${smsTo.map(whoLabel).join(' & ')}`);
    if (emails) parts.push(`✉️ ${emails} email${emails > 1 ? 's' : ''} sent`);
    return `<b>Automation fired</b><small>${esc(parts.join(' · '))}${queued ? ' (quiet hours — texts send at 7am ET)' : ''}</small>`;
  }

  const toLabel = (n) => ({ kelsey: 'Kelsey', zach: 'Zach', inbox: 'Shared inbox', partner: 'You / partner' }[n.to] || n.to);

  /** Receipt rows used by the inquiry wizard and the HQ automation log. */
  function receiptsHtml(list, { partnerLabel = 'You' } = {}) {
    if (!list.length) return '<p class="muted" style="padding:14px 18px;margin:0">No automations fired (rule disabled in HQ → Automations).</p>';
    return list.map((n) => `<div class="receipt">
      <span class="ch ${n.channel}">${EA.ui.icon(n.channel === 'sms' ? 'phone' : 'mail')}</span>
      <div class="rbody"><b>${n.channel === 'sms' ? 'Text' : 'Email'} → ${esc(n.to === 'partner' ? partnerLabel : toLabel(n))} <small class="muted">${esc(n.address || '')}</small></b>
      <span>${esc(n.subject ? n.subject + ' — ' : '')}${esc(n.body)}</span></div>
      <span class="tag ${n.status === 'queued' ? 'warn' : 'ok'}">${n.status}</span></div>`).join('');
  }

  EA.notify = { dispatch, receiptsHtml, toLabel, inQuietHours, templates: T };
})(window.EA);
