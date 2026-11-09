# Deploy the Redlining Access Atlas on DigitalOcean

Target: `redlining.research3.org`, served by Nginx on a **separate Ubuntu
Droplet**. The atlas is static; no Docker, application process, database, or
study-site changes are needed. Publish only `dist/`.

## Prepare the new Droplet and DNS

1. In DigitalOcean, create a dedicated Ubuntu Droplet using your SSH public key.
   Use an administrative account with sudo for the commands below. A Basic
   shared-CPU Droplet is sufficient to start for this static release.
2. Permit TCP 80 and 443, and SSH from your administrator IP in any active
   DigitalOcean firewall or host firewall. Leave the existing study firewall
   and services alone.
3. In the authoritative DNS service (Namecheap Advanced DNS if still using
   Namecheap DNS), create or update **only** the A record with host
   `redlining` and value equal to the **new Droplet's public IPv4 address**.
   Do not repoint the root domain, `study`, `starcasm`, or `dang`.
   Do not use the existing study Droplet's IP for this dedicated deployment.

## Install and verify

Run as a sudo-capable operator on the **new atlas Droplet** after the release
branch is pushed:

```bash
sudo apt-get update
sudo apt-get install -y git nginx certbot python3-certbot-nginx curl

git clone --branch deploy/redlining-v5-digitalocean --single-branch \
  https://github.com/tmlee10/redlining-access-atlas.git ~/redlining-access-atlas
cd ~/redlining-access-atlas

release="$(git rev-parse HEAD)"
sudo bash scripts/install-digitalocean-release.sh "$release"

sudo install -m 0644 deploy/redlining.research3.org.conf \
  /etc/nginx/sites-available/redlining.research3.org
sudo ln -s /etc/nginx/sites-available/redlining.research3.org \
  /etc/nginx/sites-enabled/redlining.research3.org
sudo nginx -t
sudo systemctl reload nginx
curl -fsS -o /dev/null -H 'Host: redlining.research3.org' http://127.0.0.1/atlas.html
```

After the public DNS record resolves to the new IP, issue the certificate:

```bash
sudo certbot --nginx --redirect -d redlining.research3.org
sudo certbot renew --dry-run
curl -fsSI https://redlining.research3.org/
curl -fsS https://redlining.research3.org/data/connected-overview.json.gz | gzip -t
curl -s -o /dev/null -w '%{http_code}\n' https://redlining.research3.org/missing-page
```

Expect HTTP 404 for the missing page. Open the homepage and
`/atlas.html#state=13&area=199`. Check Pleasant Hill → Macon-Bibb city →
Bibb County → Georgia → project South, plus the 19 state results and a CSV download.

To update, fetch and fast-forward the deployment branch, then run the installer
with the new reviewed commit SHA. To roll back, run it with the previous
commit SHA from the checkout. Nginx uses an atomic document-root pointer and
does not require a reload for content updates. Do not overwrite the Certbot
modified vhost when updating site content.

## Release scope

The v5 street maps and state dashboard are included alongside the existing
full block-group atlas. The supplied education, crime and flood results were
excluded pending verification of their source records. This deployment does not
enable GitHub Pages, change the existing Render site, or configure access for the
study applications.
