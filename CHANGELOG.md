# Changelog

## 1.0.0 (2026-05-07)


### Features

* Add Dockerfile, .dockerignore, and docker-compose.yml for Docker setup ([3e48075](https://github.com/9trocode/Fmanager/commit/3e48075c23f394308fd032cd036992296423471c))
* Add initial database schema for tables and columns ([8a3366e](https://github.com/9trocode/Fmanager/commit/8a3366e75f97f72063b78fd70b836c6e99dec5f6))
* Add migration files and runtime script for database migration and server entrypoint ([0ad5cee](https://github.com/9trocode/Fmanager/commit/0ad5ceecb81977fabdfe08351b26e20d21a5bd12))
* Add minimal theme provider for handling light, dark, and system themes ([bcfe5d5](https://github.com/9trocode/Fmanager/commit/bcfe5d5f380917c98860c37fd1f7a71dde837fc0))
* **advisor:** persisted multi-session chat history with resumable threads ([60fb947](https://github.com/9trocode/Fmanager/commit/60fb9479ceeb5f46ddb2a40dc6e1f0f9d242edaa))
* **advisor:** redesign chat — turn layout, tool collapse, smart scroll ([a2a6b73](https://github.com/9trocode/Fmanager/commit/a2a6b73d256706d22a26b138019036257a77e569))
* **advisor:** streaming agent with tools, file upload, and chat polish ([ca6d30c](https://github.com/9trocode/Fmanager/commit/ca6d30c403ca6f9bb800aa17fa777f888a9676eb))
* **budgets:** one-time expenses chip away at "Free" on the cash-flow panel ([9fbdaf4](https://github.com/9trocode/Fmanager/commit/9fbdaf47d4bf2b353197af44aa8ddcb0f476a69c))
* **dashboard,projections:** planned income as primary + money formatting on inputs ([a6b5fb6](https://github.com/9trocode/Fmanager/commit/a6b5fb69da9468f190fe29421f4e839abc45bb6f))
* **flows:** auto-accrue recurring flows so net worth reflects them ([03ac851](https://github.com/9trocode/Fmanager/commit/03ac851727b6754289398231d40b0002709e66fd))
* **flows:** explicit next-due date for recurring income/expense ([6b6fd1d](https://github.com/9trocode/Fmanager/commit/6b6fd1dd06666d8480a6a2dd6a4aca2f6e220d16))
* **flows:** pick a budget directly when creating a recurring expense ([458120b](https://github.com/9trocode/Fmanager/commit/458120b9c01dccaf4b772c068a454b01f6e7804e))
* **month:** apply global filter to /transactions + /cash-flow ([0911c54](https://github.com/9trocode/Fmanager/commit/0911c5412855d3c597186b33fe8ec312cac8270f))
* **month:** global month filter — sidebar-mounted, cookie-backed, 24-month range ([3a9020f](https://github.com/9trocode/Fmanager/commit/3a9020f0c13bd6fffe4d64a23eeddae08983b700))
* **month:** scrubable month filter on Home + Budgets, modal polish, fix flow→budget warning copy ([8603a19](https://github.com/9trocode/Fmanager/commit/8603a1909a13ddfeefaaf11a7b3b3ee4af5da4a3))
* **perf,landing:** streaming dashboard cards + product-snapshot landing sections ([4216d57](https://github.com/9trocode/Fmanager/commit/4216d578e23672018b32e1012e2b9f7551978fb6))
* **ui:** in-flight feedback on every actionable button ([f4676df](https://github.com/9trocode/Fmanager/commit/f4676dff3866b607bdc262f9bfc34d3e574441d4))
* **ui:** mobile-responsive layout — sheet nav, stacking grids, page headers ([6ffe9c1](https://github.com/9trocode/Fmanager/commit/6ffe9c12986840ca5eed92f789855b3515604f6e))


### Bug Fixes

* **advisor,landing:** loan terms in schema + system prompt; trimmed landing scroll ([6362d8b](https://github.com/9trocode/Fmanager/commit/6362d8b3a0082693f5572593a7413fdf5b3c2ad4))
* **cash-flow:** show one-time transactions on the page that creates them ([fda8733](https://github.com/9trocode/Fmanager/commit/fda87337dd46768789a53e70000191f36f842a6b))
* **deps:** bump transitive esbuild to &gt;=0.25.0 (GHSA dev-server) ([5c5d224](https://github.com/9trocode/Fmanager/commit/5c5d2242c809cced7936a179eb29207e8d281e11))
* **docker:** bundle better-sqlite3 transitive deps so prod migrate runs ([15e78d8](https://github.com/9trocode/Fmanager/commit/15e78d83dfe12e5751ff34948b21603c3e983273))
* **docker:** chown mounted /data on boot to fix SQLITE_CANTOPEN ([e01ada2](https://github.com/9trocode/Fmanager/commit/e01ada2cef44e1cbbea96fee2a66c3b66238507b))
* **docker:** pin packageManager to pnpm@10.32.1 ([1dbdd95](https://github.com/9trocode/Fmanager/commit/1dbdd952876beeac066a9131ec491ec07216d733))
* **flows:** post first transaction on create + add "Apply now" affordance ([5b92908](https://github.com/9trocode/Fmanager/commit/5b92908b48ab19f72182242830eaa25e5f504387))
* **goals:** hide equity-included disclosure when there are no grants ([efcaae4](https://github.com/9trocode/Fmanager/commit/efcaae482f81a19aa8106ec6f78a8f25f995ba75))
* **landing:** rebalance FeatureGrid to 3-per-section, drop dead sections ([699991b](https://github.com/9trocode/Fmanager/commit/699991b20fab61559028331ce3232691bb089c88))
* **perf,tz:** local-time month boundaries + per-request FX cache + nav skeletons ([7b81ae0](https://github.com/9trocode/Fmanager/commit/7b81ae097af5a3c98fb5172be746758977864134))
* **theme,docker:** cookie-based theme to kill script warning + slim runtime ([d889260](https://github.com/9trocode/Fmanager/commit/d889260c9b10b2390c876700536ec3d4328e1779))
* untrack data/ and make Docker build succeed from a clean image ([6913958](https://github.com/9trocode/Fmanager/commit/69139580a5f0e45e665e1a1b08d0aebaa86cb580))


### Performance Improvements

* **db:** N+1 fix on accounts, full index sweep, memo all aggregators ([9cd6684](https://github.com/9trocode/Fmanager/commit/9cd6684cf08032b6deedd478b0fd92f71cb51342))
* indexes on hot tables, SQLite tuning, throttled accrual, memoised net worth ([919542f](https://github.com/9trocode/Fmanager/commit/919542f66bb5e51b424900ad2d6a0d67f6cf2ecd))
