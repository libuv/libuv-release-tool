# libuv-release-tool

Command line utility for creating new releases of libuv.

## Making a release

1. Make sure you have the most up-to-date version of this tool and the libuv
branch that will be used to create the release.
2. Currently, the release tool requires Node.js v0.10.x. You may want to use
something like `nvm` to change Node versions.
3. Run `node ./release.js --version x.x.x --dir path --remote name`, where
`x.x.x` is the version of libuv you are creating, `path` is the location of
the libuv core repository on your machine, and `name` is the libuv core git
remote. This will perform a few tasks, such as updating the libuv `AUTHORS`
file if necessary. Review any changes made to libuv before continuing.
4. Run `node ./release.js --version x.x.x --dir path --remote name --continue`.
`x.x.x`, `path`, and `name` have the same meaning as in the previous step. The
`--continue` flag tells the release tool to continue work on the release started
in the previous step. If you need to cancel a release that has been started, you
can substitute `--abort` for `--continue` at any time. At this time, you should
see the CHANGELOG for the proposed release. Review the CHANGELOG for
correctness. Remove the first commit, which should mention adding the SHA to
CHANGELOG. Optionally, you may remove any commits that were made and then
reverted in this release, as they cancel each other out. Once the CHANGELOG
looks good, save the changes. You will also need to sign the release using your
GPG key.
5. Run `node ./release.js --version x.x.x --dir path --remote name --continue`
again. This updates the website, pushes the tag and branch, signs the tarball,
etc. You can verify that this step worked by checking
`http://dist.libuv.org/dist/vx.x.x`, which should include `.tar.gz` and
`.tar.gz.sign` files.
6. Create a "Now working on" commit in libuv/libuv. An example can be seen
[here](https://github.com/libuv/libuv/commit/07955ed3737cc59bc4d586b34222669ca87de755).
7. Create a new release on Github for the tag at
<https://github.com/libuv/libuv/releases/new>.
9. Make a pull request to nodejs/node to update the version of libuv.
