# Privacy plan (UK, age-appropriate): pre-launch checklist

Brief 02 builds the mechanisms; the legal decisions below are for the owner before public launch.

**Built now**
* Data minimisation: nickname, email (sign-in only), password hash, lesson answers. Guests store no personal data.
* No public profiles, followers, leaderboards, adverts or third-party analytics. Reminder notifications are off and not offered yet.
* Export (`GET /api/me/export`) and deletion (`DELETE /api/me`, cascading) from Settings.
* Session cookie is first-party, `HttpOnly`, `SameSite=Lax`.

**Owner decisions before launch**
1. Lawful basis and the Children's Code (ICO Age-appropriate design code) assessment, including default settings.
2. Age assurance and parental consent for under-13s (UK UK GDPR Art. 8): recommend either a parent-managed account or guest-only for under-13s.
3. Privacy notice written for young readers, data retention period for inactive and guest accounts (guest rows currently never expire), and hosting location.
4. Analytics: if added, restrict to anonymous counts and completion events, as the brief requires.
