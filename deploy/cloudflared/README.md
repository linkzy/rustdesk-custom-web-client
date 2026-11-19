# rclient demo tunnel (Cloudflare)

The demo has its **own** Cloudflare tunnel, separate from the owner's tunnel that
serves the rest of the host. Nothing in here is applied to the owner's tunnel, and
the owner's tunnel is never restarted when the demo changes.

| Item | Value |
| --- | --- |
| Tunnel name | `rclient-demo` |
| Tunnel ID | `cc58c549-6980-404d-b653-9bc9d8ca4613` |
| Config file on the VPS | `/etc/cloudflared/rclient-demo.yml` |
| systemd unit | `rclient-demo-tunnel.service` |
| Public hostname | `rclient-demo.linkzy.dev` |
| Origin | `http://localhost:8090` (the demo `web` container) |

Credentials live in `/root/.cloudflared/cc58c549-...json` (mode 400). They are
secrets: never copy them into the repository, a message, or another machine.

## Why a separate tunnel

The owner's `/etc/cloudflared/config.yml` serves several unrelated services
(medialib, immich, endurain, …). Editing and restarting that file would put all
of them through a restart for a demo — and a mistake there would take the
owner's sites down. A second tunnel with a single ingress rule is isolated: if the
demo breaks, only the demo breaks.

## Adding/replacing the demo hostname

```sh
export TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem
cloudflared tunnel route dns cc58c549-6980-404d-b653-9bc9d8ca4613 rclient-demo.linkzy.dev
```

That creates the proxied CNAME in Cloudflare to
`cc58c549-6980-404d-b653-9bc9d8ca4613.cfargotunnel.com`.

## Restarting only the demo tunnel

```sh
systemctl restart rclient-demo-tunnel.service
systemctl status  rclient-demo-tunnel.service --no-pager
journalctl -u rclient-demo-tunnel -n 50 --no-pager
```

Do **not** run `systemctl restart cloudflared` for demo work: that is the owner's
tunnel and it serves production hostnames.

## Removing the demo cleanly

```sh
systemctl disable --now rclient-demo-tunnel.service
rm /etc/systemd/system/rclient-demo-tunnel.service
systemctl daemon-reload
export TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem
cloudflared tunnel route dns delete rclient-demo.linkzy.dev   # optional: drop DNS
cloudflared tunnel delete rclient-demo
cd /home/demo && docker compose down
```
