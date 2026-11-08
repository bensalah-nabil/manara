# Account fixture (test only)

A tiny app that owns one account type (`com.manara.fixture`). Opening it adds
the account `child@fixture.test` and writes `files/marker.txt`. Guided setup's
on-device test (`agent/.../matrix/PauseForOwnerTest.kt`) uses it to check, on
a real Android build, that pausing an app lets Manara become device owner
while the app's account and data stay.

Never install it on a child's phone. It is for emulators and throwaway test
devices only.

```
./gradlew.bat assembleDebug
adb -s emulator-5554 install app/build/outputs/apk/debug/app-debug.apk
```

The test opens the app itself; it skips when the fixture isn't installed.
