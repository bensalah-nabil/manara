# Legal and ethics

Manara handles location and call data — some of the most sensitive data there
is. This document is binding on the project's design, not just advice.

## Intended use

Manara is for a **parent or legal guardian managing their own minor child's
device**, with the child able to see the device is managed. That is the use the
whole design serves, and the one with the clearest legal footing in most
jurisdictions.

## The visibility principle (why it exists)

A tool that can hide its own monitoring is stalkerware, whatever story ships
with it. The code cannot tell a parent hiding it from a child apart from an
abuser hiding it from a partner — and neither can Google's Play Protect, which
flags hidden-monitoring behavior as malware regardless of stated intent.

So Manara keeps monitoring **visible by construction**:

- a permanent, non-removable "this device is managed" notice;
- no stealth mode, and no configuration that removes the notice;
- the person on the device can always see what is being collected.

This is simultaneously an ethical stance, a legal safeguard, and the thing that
keeps the agent from being classified as malware. Removing it would break the
product for legitimate families, not just cross an ethical line.

## What contributors must not add

- A hidden, stealth, or "invisible" mode.
- Any switch that disables or hides the managed-device notice.
- Collection of data from a device the operator isn't entitled to manage.
- Features aimed at monitoring other adults without their knowledge.

PRs doing any of the above will be declined on sight.

## For anyone deploying Manara

- Use it only on your own devices or your own minor child's device.
- Monitoring another adult — including an employee — without clear, lawful
  notice and consent is illegal in many countries. This is on the deployer.
- Laws differ by country (Tunisia, the EU, the US all differ). If you deploy
  this for anyone beyond your own household, get local legal advice first,
  especially before enabling call or location collection.
- A child's rights grow with age; "my own child" is cleanest for young
  children and gets more nuanced for teenagers in some jurisdictions.

## Data handling commitments (see architecture §6)

- Collect a category only when its policy is enabled.
- Short default retention; purge old location/call data.
- Encrypt in transit and at rest.
- Minimize: don't collect what a feature doesn't need.

*This document is not legal advice. It records the project's rules and the
obligations that fall on deployers.*
