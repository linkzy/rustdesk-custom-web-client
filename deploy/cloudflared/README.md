# A Cloudflare Tunnel for a demo instance

A template for giving a demo instance its own tunnel, so it shares nothing with
whatever else you run on that machine. Everything here is a placeholder: replace
the values, and keep your real IDs and paths out of the repository.

## Why a separate tunnel

A tunnel is a single ingress: its config file is one list, and restarting the
service restarts every hostname on it. If the demo shares a tunnel with real
services, a demo change is a risk to all of them, and a demo crash is
indistinguishable from a real outage. A second tunnel with one rule is isolated:
if it breaks, only the demo breaks.

## Creating it

```sh
# once per machine, if you have not already
cloudflared tunnel login

cloudflared tunnel create rclient-demo        # prints a UUID
```

Write its config as its own file, e.g. `/etc/cloudflared/rclient-demo.yml`, from
[`rclient-demo.yml`](./rclient-demo.yml) — replacing the UUID and the credentials
path. Then point DNS at it and run it as a service:

```sh
cloudflared tunnel route dns rclient-demo demo.example.com
```

Install the unit from [`rclient-demo-tunnel.service`](./rclient-demo-tunnel.service),
adjusted to your user and paths, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now rclient-demo-tunnel
sudo systemctl status rclient-demo-tunnel --no-pager
```

## What is a secret here

The tunnel's **credentials JSON** is a secret: whoever holds it can serve traffic
as your tunnel. It belongs on the host only, in a directory no other user can read,
and never in the repository, a message, or another machine. Its file name contains
the tunnel UUID, which is why the template here uses a placeholder.

The tunnel UUID on its own is not a credential, but treat it as private anyway: it
identifies your tunnel, and publishing infrastructure identifiers is a habit with
no upside.

## Operating it

```sh
sudo systemctl restart rclient-demo-tunnel    # only this tunnel
journalctl -u rclient-demo-tunnel -n 50 --no-pager
```

Never restart the shared `cloudflared` service for demo work if other hostnames
depend on it.

## Removing it

```sh
sudo systemctl disable --now rclient-demo-tunnel
sudo rm /etc/systemd/system/rclient-demo-tunnel.service
sudo systemctl daemon-reload
cloudflared tunnel route dns delete demo.example.com   # optional: drop the CNAME
cloudflared tunnel delete rclient-demo
```

Then stop the demo's containers. Note that a DNS or CDN cache may keep serving the
hostname for a while after that; verify against the origin rather than the public
URL.
