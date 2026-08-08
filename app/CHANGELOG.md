## [2.0.3](https://github.com/rexmarchant/busybeegrocer/compare/v2.0.2...v2.0.3) (2026-08-08)


### Bug Fixes

* retire the old service worker instead of stranding it ([74e3071](https://github.com/rexmarchant/busybeegrocer/commit/74e30712814c444fd18218fb9e02001daaa3b928))

## [2.0.2](https://github.com/rexmarchant/busybeegrocer/compare/v2.0.1...v2.0.2) (2026-08-08)


### Bug Fixes

* enumerate the app's routes so deep links serve the app with a 200 ([e5a9a3d](https://github.com/rexmarchant/busybeegrocer/commit/e5a9a3d29b6a9f111c60d2baa605abb8182a5087))

## [2.0.1](https://github.com/rexmarchant/busybeegrocer/compare/v2.0.0...v2.0.1) (2026-08-08)


### Bug Fixes

* serve the app on client-side routes, not the landing page ([036d56c](https://github.com/rexmarchant/busybeegrocer/commit/036d56c6a0c867584c7a256e0b6fddc5c9deb6d7))

# [2.0.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.8.1...v2.0.0) (2026-08-08)


* feat!: move BusyBeeGrocer to busybeegrocer.com ([b3a3dcb](https://github.com/rexmarchant/busybeegrocer/commit/b3a3dcb9de9ed7f215b3196d5ba0130b56010cd8))


### BREAKING CHANGES

* The app has moved to a new domain, and every existing
home-screen install is orphaned by it. A PWA's identity is its origin, so an
installed copy will go on opening the old address, will never receive another
update, and cannot be migrated. Everyone has to delete the old icon and install
again from busybeegrocer.com.

Signed-in sessions, offline caches, store filters and any paused shopping trip
live in per-origin storage and do not travel with it, so everyone signs in once
more. Nothing server-side is affected: lists, items, groups and trip history are
untouched.

The manifest id is now pinned to a fixed value rather than the served path, so
this is the last time a move costs anyone their install.

## [1.8.1](https://github.com/rexmarchant/busybeegrocer/compare/v1.8.0...v1.8.1) (2026-08-07)


### Bug Fixes

* header no longer overflows once a group switcher appears ([8063d4b](https://github.com/rexmarchant/busybeegrocer/commit/8063d4b91f1e2d7ee2f8eff452362ae5ca7bed75))

# [1.8.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.7.2...v1.8.0) (2026-08-07)


### Features

* group roles, with co-owners, and show which group you're in ([7d1ed87](https://github.com/rexmarchant/busybeegrocer/commit/7d1ed87376fdbc4e06a42566d3f2c75ca611fac3))

## [1.7.2](https://github.com/rexmarchant/busybeegrocer/compare/v1.7.1...v1.7.2) (2026-08-07)


### Bug Fixes

* explain why an invite can't be accepted instead of hanging on "Joining..." ([5a29659](https://github.com/rexmarchant/busybeegrocer/commit/5a296594d13f300bec69d562b6a2cb18bbc6560b))

## [1.7.1](https://github.com/rexmarchant/busybeegrocer/compare/v1.7.0...v1.7.1) (2026-08-07)


### Bug Fixes

* stop the invite screen implying an email was sent ([4597ea4](https://github.com/rexmarchant/busybeegrocer/commit/4597ea4a5f2996c9356452f4da42b64d5b21b6f9))

# [1.7.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.6.4...v1.7.0) (2026-08-07)


### Features

* add the delete-account edge function ([872b885](https://github.com/rexmarchant/busybeegrocer/commit/872b88553a805d043b67000d3db45c47fbdef868))

## [1.6.4](https://github.com/rexmarchant/busybeegrocer/compare/v1.6.3...v1.6.4) (2026-08-07)


### Bug Fixes

* stop entering shopping mode creating two sessions ([7e12dc5](https://github.com/rexmarchant/busybeegrocer/commit/7e12dc5f6758b7caca4b45de6954e8ab91b1b32d))

## [1.6.3](https://github.com/rexmarchant/busybeegrocer/compare/v1.6.2...v1.6.3) (2026-08-07)


### Bug Fixes

* show queued changes after an offline reload, and resume the timer at once ([05b0ad8](https://github.com/rexmarchant/busybeegrocer/commit/05b0ad817ca1fe865736aa39decc1402a3523a67))

## [1.6.2](https://github.com/rexmarchant/busybeegrocer/compare/v1.6.1...v1.6.2) (2026-08-07)


### Bug Fixes

* don't send people to Create-your-group on an offline reload ([534982d](https://github.com/rexmarchant/busybeegrocer/commit/534982d49963df29cfc72b3a96ec188ba638a151))

## [1.6.1](https://github.com/rexmarchant/busybeegrocer/compare/v1.6.0...v1.6.1) (2026-08-07)


### Bug Fixes

* a trip started with no signal could never be finished ([bf670a7](https://github.com/rexmarchant/busybeegrocer/commit/bf670a7485f1ef12b0a4ace707c5be3d899655d6))

# [1.6.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.5.1...v1.6.0) (2026-08-06)


### Bug Fixes

* **db:** close open group-join policy and allow account deletion ([7214fa5](https://github.com/rexmarchant/busybeegrocer/commit/7214fa537e371ade2fb23a8279550157ff97a9ea))
* **pwa:** pin an explicit manifest id so future moves don't orphan installs ([92f40b0](https://github.com/rexmarchant/busybeegrocer/commit/92f40b074a7e19028c345566689b397bca3a3e65))
* surface failed saves and stop render crashes becoming white screens ([40acebb](https://github.com/rexmarchant/busybeegrocer/commit/40acebb86270dc1c2a4e059fe306fab60331bf03))


### Features

* generate the share QR on device instead of baking it into the poster ([a89b335](https://github.com/rexmarchant/busybeegrocer/commit/a89b3358a0e581955d81cbe62ae665d96acdef20))
* **pwa:** add install screenshots to the manifest ([c051500](https://github.com/rexmarchant/busybeegrocer/commit/c0515008b7c93b8e93ae14a33c1f4d8e6607e726))
* queue item toggles made offline and replay them on reconnect ([38951d1](https://github.com/rexmarchant/busybeegrocer/commit/38951d142fcf6cbb59e8bc9037fce20bf6b1d2a2))
* report errors to Sentry ([40e3503](https://github.com/rexmarchant/busybeegrocer/commit/40e350395a4f76943315f5767c3c23e3f0c546ec))
* require a Turnstile captcha before requesting a sign-in link ([f976359](https://github.com/rexmarchant/busybeegrocer/commit/f97635994a0e7ed5c02ede15af17a6e5306c3690))
* show a cached copy of the list when reads fail ([e9b5553](https://github.com/rexmarchant/busybeegrocer/commit/e9b555300425812b92bcfceb5123269d5c197998))
* suggest corrections for mistyped email domains ([10b3533](https://github.com/rexmarchant/busybeegrocer/commit/10b3533a44db5fb173f7bc518b565cccba5a0a21))

## [1.5.1](https://github.com/rexmarchant/busybeegrocer/compare/v1.5.0...v1.5.1) (2026-08-01)


### Bug Fixes

* move the Tutorial button to the main settings screen and hide the dead gear ([13df195](https://github.com/rexmarchant/busybeegrocer/commit/13df195ec931be19b6c586c9cd8797e30d5ce77e))

# [1.5.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.4.0...v1.5.0) (2026-07-31)


### Features

* add a Tutorial video button to the list settings screen ([5b190dc](https://github.com/rexmarchant/busybeegrocer/commit/5b190dcd60c899326fdaa9ddb5c304d4be069f10))

# [1.4.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.3.0...v1.4.0) (2026-07-31)


### Features

* share the list store filter with shopping mode and group the finish email ([27079e3](https://github.com/rexmarchant/busybeegrocer/commit/27079e3c7c93d415316a6ceb02c4d36b660d43e2))

# [1.3.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.2.0...v1.3.0) (2026-07-25)


### Features

* open a promo/about screen when the header logo is tapped ([be3a42e](https://github.com/rexmarchant/busybeegrocer/commit/be3a42ef31b7d0d5c7fcc3f8ed61146a5d82deed))

# [1.2.0](https://github.com/rexmarchant/busybeegrocer/compare/v1.1.1...v1.2.0) (2026-07-25)


### Features

* let group owners remove members; fix header overflow and back-arrow sizing ([b1cfce0](https://github.com/rexmarchant/busybeegrocer/commit/b1cfce009e4e217edc2169ca0f5ee4af75dc3e3d))

## [1.1.1](https://github.com/rexmarchant/busybeegrocer/compare/v1.1.0...v1.1.1) (2026-07-25)


### Bug Fixes

* bump CI Node version to 24 so semantic-release can run ([c837b73](https://github.com/rexmarchant/busybeegrocer/commit/c837b730c45562c86bb37c4c2d7e6f2055d09882))
