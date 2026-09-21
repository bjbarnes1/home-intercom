# Is Vercel the right platform for famOS?

Companion to ADR-003. Written because the presence miss raised a fairer
question than the one it answered: how much of this system's shape is a
response to the product, and how much is a response to where it is hosted?

**Short answer: Vercel is right for the web surfaces and increasingly wrong for
the control plane — and the control plane is where the hard parts of this
product live. The recommendation is to split, not to migrate.**

---

## The tell

There are now three managed services holding state that a single long-running
process could hold:

| Service | Doing | Partly because |
| --- | --- | --- |
| LiveKit Cloud | The persistent socket every panel sits on | Functions cannot hold a connection |
| Upstash | Presence, rate limits, the device-auth cache | Functions have no shared memory and no lifetime |
| Neon | The durable record | — this one is a genuine requirement |

Only the third is driven by the product. The other two are, in part, driven by
the execution model.

The clearest example is the heartbeat this document exists because of. A panel
polls every ten seconds over HTTP to say "still here" and to collect settings it
almost never needs. **That poll exists because there is no socket to push
over.** The panel already holds a persistent LiveKit connection — the server
just has no process on the other end of it to notice.

With a long-running control plane, presence is not a write at all. It is the
connection. The room a panel should show is pushed when it changes, not
re-fetched 8,640 times a day on the chance that it did.

So: the heartbeat was fixed, and it should not need to exist.

## Where Vercel stops fitting

Four places, in rough order of when they bite.

**1. No persistent connections.** The product is a real-time control plane for
audio in a house. That work is currently outsourced to LiveKit Cloud, which is a
reasonable thing to buy — but every presence and command decision has been
shaped around "we cannot keep a socket open", and that constraint is the
platform's, not the product's.

**2. The scheduler is one function.** `fireDueReminders` does an unpartitioned
scan across every tenant and processes them **serially** inside a single
60-second invocation, calling out to the control sender once per reminder. That
works for one household. It has a ceiling measured in hundreds, and the fix is a
job runner or a durable queue — neither of which is a cron entry.

**3. Regional placement is per project, not per tenant.** The stated goal is
infrastructure near customers, elastic, globally. Vercel pins functions to a
region per *project*. Multi-region tenancy means multiple projects and a routing
layer in front — workable, but it is building the thing rather than using it.

**4. There is no story for the LAN.** The spec says a minimal non-subscription
base must keep the hardware working, and the review found the opposite: with the
cloud unreachable a Hub shows a clock. Everything — control, TTS, reminders,
presence — is a cloud round trip. A house that works without a subscription
needs a control plane that can run *in the house*, and that is not a thing
Vercel hosts.

Point 4 is the one that should decide this, because it is not a scaling concern
that can be deferred. It is in the product definition.

## Where Vercel genuinely fits

Not a consolation prize — this is real:

- The **admin portal** (W1–W4 in its spec), the **controller**, and any
  marketing surface are Next.js apps with request/response semantics. That is
  exactly what Vercel is excellent at, and there is no reason to move them.
- Preview deployments, zero-ops, and the build pipeline are genuine wins for a
  small team, and give up nothing.

The mistake would be reading "Vercel is wrong for the control plane" as "move
everything". Most of the repo should stay.

## The recommendation: split

Keep on Vercel:
- Next.js web surfaces — `/controller`, the portal when it exists, marketing
- Stateless HTTP API — auth, CRUD, anything request/response

Move to a long-running service:
- **Presence and the control plane** — the socket the panels already hold
- **The scheduler** — reminders, retention, place rules, as real jobs
- **Fan-out** — per household, in parallel, not one serial pass over all tenants

The deciding argument for this shape is not cost or scale. It is that **the same
control-plane process you run in the cloud is the one you would run on a Hub for
the LAN case.** One implementation, two deployments. That is the only path that
makes the non-subscription base and D3(c) — "broker on the Hub, cloud relaying
only when off-LAN" — reachable rather than aspirational. A Vercel function can
never run on a Hub.

### Where

A container platform with per-region app placement and no connection limit.
Fly.io fits the shape closely (regional placement is first-class, and the same
image runs on a box in a house); Railway and Render are simpler and give up
regional control; a plain VM per region is the most work and the most control.
**This should be decided on ops appetite, not on a feature matrix** — all three
can hold a socket and run a worker, which is the whole requirement.

### What I do not know

Stated plainly, because these change the answer and I am not the one who knows
them:

- **Ops appetite.** A long-running service is a thing that can be down at 3am in
  a way a Vercel function is not. Is that a trade worth making now?
- **Budget and timeline to first units.** Splitting costs weeks that are not
  user-visible — the same objection D2 raises about the identity migration, and
  the same answer may apply: do the migrations before there are real families on
  the system, not after.
- **D1, the device OS.** If the Hub runs AOSP, an on-device control plane is a
  service in the image. That decision is upstream of this one, and this
  recommendation assumes it lands somewhere that can run a container or a
  binary.

### How to decide it cheaply

The control plane is small: presence, command fan-out, and a job loop. Standing
it up as one long-running service against the existing schema is days, not
weeks, and it would settle the question with a number — the same argument D8
makes for running famOS-Bench before committing to the resolver architecture.

Do that before the identity migration, because the migration is easier to run
against the architecture you are keeping.

---

## What this is not

It is not "we picked wrong". Vercel got the product to a working wall panel with
real audio, real weather and real music, on a small team, quickly. That was the
right call for that phase.

It is that the phase has changed. The next things on the roadmap — multi-region,
multi-household, a non-subscription base, hardware panels — are all things the
execution model makes harder, and none of them are things it makes easier.
