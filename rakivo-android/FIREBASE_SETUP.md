# Firebase Setup

Rakivo is now wired for Firebase Analytics, but you still need your own Firebase project.

Steps:

1. Create a Firebase project in the Firebase console.
2. Add an Android app with package name `com.mmp.rakivo`.
3. Download `google-services.json`.
4. Place that file at:
   `rakivo-android/app/google-services.json`
5. Rebuild the app.

Notes:

- `google-services.json` is ignored by git on purpose.
- If the file is missing, Rakivo still builds and analytics calls safely no-op.
- Once the file is present, the Google Services plugin is applied automatically and Firebase Analytics starts working.
