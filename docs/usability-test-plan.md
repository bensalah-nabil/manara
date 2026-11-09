# Usability test: can a parent set up Manara alone?

Every guided setup so far was run by the developer. This test answers the
question that decides whether Manara works as a product: **can a parent with
no technical background connect their child's phone, alone, without losing
access to an account?**

## What we want to learn

1. How many parents finish setup with no help.
2. Where they get stuck, and for how long.
3. Whether anyone loses access to an account, or comes close to it.
4. Whether they understood what Manara does to the phone (managed notice,
   rules) and that their child will see it.

## Who

- **5 parents**, recruited outside tech jobs. Five sessions find most of
  the big problems; fix them, then run five more.
- At least **2 with a Samsung**, the hardest path (accounts removed for a
  moment, ADR-0006), and **1 with a stock Android phone** (Pixel or
  Motorola).
- Mixed comfort with phones. Include at least one who has never opened
  Settings beyond Wi-Fi.

## Which phone

**Round 1 uses a lab phone, not the child's.** The SM-A045F or the A52,
reset beforehand, signed in to a **test Google account** the session owns
(not the parent's). Nothing of a real child's is at stake, and an account
lost in the test costs nothing.

Give the parent the test account's recovery method as they would really
have it (for example, a passkey on a second phone, or the recovery number on
a phone in the room), so the "how you'll get back in" step is real.

**Round 2**, after fixing what round 1 found: the parent's own child's
phone, with the parent's consent and the child told, as the console's three
statements require. Stop rules below apply even more strictly.

## Before each session

- Lab phone reset, test account signed in, a Facebook or WhatsApp test
  account added if the phone should look lived-in.
- Manara installed and the console open on a laptop, signed in to a fresh
  test parent account.
- Consent form signed: what is recorded (notes and timings, no screen
  recording of account names or codes), that they can stop at any time,
  and that this tests Manara, not them.

## Script

Read this, then stay quiet:

> "This is a new app for parents. Please set it up on this phone as if it
> were your child's, using only what's on the screen. Say what you're
> thinking as you go. I can't help, but if you'd give up at home, tell me
> and we'll stop there."

Don't point, explain, or confirm. If asked, say "What would you do at
home?" Note every question.

**Stop rules.** Stop and help, and count the session as not finished, if:
- the parent is about to remove the Google account **without** a way back
  in that they've checked works;
- they've been stuck on one step for 10 minutes;
- they say they would give up.

## What to record, per step

| Step | Finished alone? | Minutes | Questions asked | Wrong turns | Quote |
|---|---|---|---|---|---|
| Add a phone, three statements, brand | | | | | |
| Accounts warning and Google check | | | | | |
| Developer options (Build number ×7) | | | | | |
| Wireless debugging on | | | | | |
| Connection code scanned | | | | | |
| Start guided setup, pair | | | | | |
| Samsung: accounts removed in Settings | | | | | |
| Signed back in to Google | | | | | |
| Finish setup | | | | | |

Also note: total time; whether any app was uninstalled or any data lost (it
shouldn't be); every time the phone left the Wireless debugging screen
during pairing.

## Right after

Ask, in this order:
1. "How hard was that, from 1 (very easy) to 7 (very hard)?"
2. "What does Manara now do on this phone?" (checks they understood the
   managed notice and the rules)
3. "What will your child see?"
4. "Would you do this at home, alone? What would stop you?"

## Reading the results

- **Finished alone by fewer than 4 of 5:** the hardest step is the next
  thing to fix, before anything else on the roadmap.
- **Anyone lost access to an account:** stop round 2 until that path is
  fixed.
- **A step with more than 2 questions on average:** rewrite its text or add
  pictures (`enrollment.ts`, `guide.html`).
- Compare Samsung and stock Android times: if Samsung takes more than twice
  as long, the factory-reset path ("set it up before signing in") should be
  the one the console recommends first for a new Samsung.

Write each round's findings in `pending-verifications.md`, with the date and
the phones used.
