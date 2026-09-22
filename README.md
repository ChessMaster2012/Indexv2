# Index combined build

This build is based on the Profile/Persistent-Rewards application and combines the rewards/profile features with first-launch county selection, dynamic local Terms/Privacy/Review/Contact pages, student conduct and academic-integrity safeguards, and the school-browser-compatible same-origin AI proxy.

## AI clarification
The frontend does not contain a paid provider API key. The `/api/ai/chat` route uses the unauthenticated text provider route already used by the older working Index architecture. There is no app-level daily question cap. That does NOT mean literally infinite free capacity: the external provider and the Render host still have finite capacity and can be unavailable or rate-limited.

## County setup
On a new browser/device, the first-launch gate asks for county/district first and then requires five acknowledgments: Terms, Privacy, Safety/Conduct, AI/Academic Integrity, and local school-use guidance. The selection is stored locally. Existing users who already accepted the older gate and already have a county are migrated so they are not trapped behind a duplicate gate. The county can be changed later from the signed-in profile.

## MCPS wording
The MCPS page links to official MCPS resources. Index does not claim that it is MCPS-approved or endorsed.
