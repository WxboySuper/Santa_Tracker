## Main → stable promotion

- [ ] Prepared via **Prepare Main Stable Promotion** (`promotion/v*` → `main`)
- [ ] `main` is the reviewed next-major source; no unreleased main work is being deployed directly
- [ ] `CHANGELOG.md` next-major lane was converted into the stable release section
- [ ] `deploy/production-release.json` matches the promoted stable version
- [ ] CI, Greptile, and Kilo are green
- [ ] Hosted beta snapshot was smoke-tested from the same source
- [ ] After merge: bootstrap `stable/X.Y.x` from the exact merged `main` commit
- [ ] After the stable line is reviewed: manually run **Create Stable Release**
