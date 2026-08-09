# Privacy

Busy Bee Grocer is a personal project, not a company. This page describes exactly what it stores,
who else can see it, and how to get rid of it.

Last updated: 9 August 2026

## What is stored

**Your email address.** This is how you sign in — there are no passwords. It is also how invites
are matched, so an invite can only be accepted by the address it was sent to.

**A display name**, which defaults to your email address until you change it.

**Everything you put in the app**: group names, list names, items, quantities, notes, the stores
and categories you create, and which items you mark as favorites.

**Your shopping trips**: when a trip started and ended, how many items it covered, how many were
ticked off, and a snapshot of the list at the end so a trip can be repeated.

**A running count**, per item, of how many times it has been ticked off or put back.

**Who changed what**: each item records who added it and who last changed it, so people sharing a
list can see where a change came from.

Anyone in a group can see everything in that group, including your display name and email address
against the changes you make. Lists marked private are visible only to their owner.

## What is not stored

There is no analytics, no advertising, and no tracking of any kind. Nothing you do in the app is
profiled, sold, or shared with anyone for marketing. There are no third-party cookies. Session
replay — which would record your screen, and therefore your lists — is deliberately switched off.

## What is kept on your device

Your browser's local storage holds your sign-in session, your display preferences (sort order,
which sections are collapsed, your store filter), a cached copy of your lists so the app works
without signal, and any changes made offline that haven't been sent yet. Signing out or clearing
site data removes all of it.

## Services used

Running the app means a handful of other companies necessarily handle some data:

**Supabase** hosts the database and handles sign-in. All the data above is stored there, on
servers in the United States.

**Resend** sends sign-in and invite emails. It receives the address the email is going to.

**Cloudflare Turnstile** runs the "are you human" check on the sign-in form. Cloudflare receives
your IP address and browser characteristics as part of that check. It exists to stop automated
sign-up attempts, which would otherwise exhaust the daily email allowance and lock real people out.

**Sentry** receives a report when the app crashes, so the crash can be fixed. These reports carry
the app version and a technical stack trace. They are configured not to attach your email address
or other identifying details.

**Cloudflare Pages** serves the app itself and, like any web server, sees the IP address that
requests it.

## Deleting your account

Open **Settings** and choose **Delete my account**. It happens straight away — your account is
deleted, along with your display name and the record of it. If that fails for any reason, email the
address at the bottom of this page and it will be done by hand.

Two things worth knowing before you do:

Content you added to a shared group — items, stores, categories — **stays with the group**, because
other people are still using it. Your name is removed from it; the item is not.

If you are the owner of a group, ownership passes to the longest-standing remaining member, so the
group doesn't become unmanageable.

## Children

The app is not aimed at children and does not knowingly collect data from anyone under 13.

## Changes

This file is version-controlled in the project's public repository, so its full history is visible.
Material changes will be noted by the "last updated" date above.

## Contact

Questions, or a deletion request: **busybeegrocer@gmail.com**

---

This is a plain description of how a hobby project handles data, written by its author. It is not
legal advice and is not a contract.
