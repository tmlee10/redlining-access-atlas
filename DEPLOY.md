# Deploy the Redlining Access Atlas on DigitalOcean

Production: https://redlining.research3.org/ on the shared Ubuntu Droplet
(`143.198.36.166`) that also serves the main site, StARCASM, DANG, and Study.
The atlas has its own Nginx virtual host, document root, and TLS certificate.
It serves only static files from `dist/`.

## Update the installed atlas

Run as `deploy` on the shared Droplet. Use your existing SSH key. From Windows
PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\starcasm_dang" -o IdentitiesOnly=yes deploy@143.198.36.166
```

On Ubuntu, fetch the reviewed release and check it out by its full commit SHA.
For new releases merged into `main`, fetch that branch explicitly because the
initial checkout was cloned with `--single-branch`.

```bash
cd ~/redlining-access-atlas
git fetch origin main
git log -1 --oneline FETCH_HEAD
```

Confirm the fetched commit is the intended release, then install it:

```bash
git switch --detach FETCH_HEAD
release="$(git rev-parse HEAD)"
sudo bash scripts/install-digitalocean-release.sh "$release"
```

The installer checks all required assets and atomically updates the atlas
document root. For a rollback, run the installer with the previous reviewed
commit SHA from the same checkout. A content update does not require an Nginx
reload. Keep the existing Certbot-managed atlas virtual host in place.

## Initial setup reference

The GitHub release already includes the static files. For a first install,
clone the repository, check out the reviewed commit, and run
`sudo bash scripts/install-digitalocean-release.sh FULL_COMMIT_SHA`.
On the shared server, install the supplied HTTP virtual host only if the
atlas site has not already been configured:

```bash
site=/etc/nginx/sites-available/redlining.research3.org
enabled=/etc/nginx/sites-enabled/redlining.research3.org
if [ ! -e "$site" ] && [ ! -L "$site" ] && [ ! -e "$enabled" ] && [ ! -L "$enabled" ]; then
    sudo install -m 0644 deploy/redlining.research3.org.conf "$site" &&
    sudo ln -s "$site" "$enabled" &&
    if sudo nginx -t; then
        sudo systemctl reload nginx
    else
        sudo rm -- "$enabled" "$site"
    fi
fi
curl --noproxy '*' -fsSI -H 'Host: redlining.research3.org' http://127.0.0.1/atlas.html
```

The `redlining` DNS A record points to `143.198.36.166`. Leave the records and
Nginx configurations for the other sites in place. After public DNS resolves
and the atlas HTTP virtual host works, request the atlas-specific certificate:

```bash
sudo certbot --nginx --cert-name redlining.research3.org --redirect -d redlining.research3.org
```

## Verify the release

```bash
curl --noproxy '*' -fsSI https://redlining.research3.org/atlas.html
(
  set -o pipefail
  curl --noproxy '*' -fsS https://redlining.research3.org/data/connected-overview.json.gz | gzip -t
)
```

Open `/atlas.html#state=13&area=199`. Check Pleasant Hill → Macon-Bibb city →
Bibb County → Georgia → project South, plus the state results and a CSV
download. Spot-check the other sites after changes to Nginx.

## Release scope

The v5 street maps and state dashboard are included alongside the full
block-group atlas. Education, crime, and flood results were excluded pending
verification of their source records. GitHub Pages is not enabled by this
release. The separate Render service may rebuild automatically from `main`;
the DigitalOcean atlas updates only when the installer runs.
