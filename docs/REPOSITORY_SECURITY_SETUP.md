# Repository Security Setup

After pushing this repository to GitHub, enable the following protections.

## Secret scanning and push protection

Open **Repository → Settings → Code security and analysis**. Under **Secret Protection**, enable **Secret scanning** and **Push protection**. If organization policy controls these settings, request that an organization owner enables them for this repository.

## Branch protection

Open **Repository → Settings → Branches → Add branch protection rule** and set the branch pattern to `main`. Enable **Require a pull request before merging**, **Require approvals** (at least 1 when collaborators are available), **Require status checks to pass before merging**, and select the CI checks after their first successful run. Enable **Require conversation resolution before merging**, **Require linear history**, and **Do not allow bypassing the above settings** for maintainers where available. Disable force pushes and branch deletion.

These settings mitigate accidental secret disclosure and unreviewed changes; they do not replace code review or access control.
