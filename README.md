# SEP-10 Auth Server

A minimal Node.js/Express server implementing Stellar SEP-10 authentication,
serving `stellar.toml`, and issuing JWTs. Ready to deploy on AWS EC2.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/stellar.toml` | Serves your stellar.toml |
| GET | `/auth?account=G...` | Issues a SEP-10 challenge |
| POST | `/auth` | Verifies signed challenge, returns JWT |
| GET | `/` | Health check |

---

## Local Setup

```bash
npm install
cp .env.example .env
# Fill in your .env values
npm start
```

---

## AWS EC2 Deployment (Step by Step)

### 1. Launch EC2 Instance
- Go to AWS Console → EC2 → Launch Instance
- Choose **Ubuntu 22.04 LTS**
- Instance type: **t2.micro** (free tier)
- Create or select a key pair (.pem file)
- Security group — open these ports:
  - SSH: port 22
  - HTTP: port 80
  - HTTPS: port 443

### 2. Connect to your instance
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_DNS
```

### 3. Install Node.js and nginx
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
```

### 4. Upload your project
From your local machine:
```bash
scp -i your-key.pem -r ./sep10-server ubuntu@YOUR_EC2_PUBLIC_DNS:~/
```

### 5. Install dependencies and configure env
```bash
cd ~/sep10-server
npm install --production
cp .env.example .env
nano .env   # fill in your actual values
```

### 6. Run with PM2 (keeps server alive)
```bash
sudo npm install -g pm2
pm2 start src/index.js --name sep10-server
pm2 startup    # follow the printed command to auto-start on reboot
pm2 save
```

### 7. Configure nginx
```bash
sudo nano /etc/nginx/sites-available/sep10
# Paste contents of nginx.conf, replace YOUR_DOMAIN_OR_EC2_DNS

sudo ln -s /etc/nginx/sites-available/sep10 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Add HTTPS with Let's Encrypt (if using a custom domain)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
> If using the raw EC2 DNS (ec2-xx-xx.compute.amazonaws.com), HTTPS via certbot
> won't work. Use a custom domain via Route 53, or use an AWS Load Balancer
> with ACM certificate for HTTPS on the raw DNS.

### 9. Your server is live at
```
https://YOUR_DOMAIN/.well-known/stellar.toml
https://YOUR_DOMAIN/auth
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STELLAR_SECRET_KEY` | Your Stellar secret key (S...) |
| `STELLAR_PUBLIC_KEY` | Your Stellar public key (G...) |
| `JWT_SECRET` | Random secret for signing JWTs (use: `openssl rand -hex 32`) |
| `CLIENT_DOMAIN` | Your server's domain (e.g. `ec2-xx.compute.amazonaws.com`) |
| `PORT` | Port to run on (default: 3000) |

---

## MoneyGram Allowlist

Once deployed, submit your domain to MoneyGram at:
https://developer.moneygram.com

Your client domain will be:
```
YOUR_DOMAIN
```

---

## Testing SEP-10 Flow

```bash
# 1. Get a challenge
curl "https://YOUR_DOMAIN/auth?account=YOUR_PUBLIC_KEY"

# 2. Sign the transaction with your secret key (use Stellar Lab)
# https://laboratory.stellar.org/#txsigner

# 3. Submit signed transaction
curl -X POST "https://YOUR_DOMAIN/auth" \
  -H "Content-Type: application/json" \
  -d '{"transaction": "SIGNED_XDR_HERE"}'

# You'll get back a JWT token to use with MoneyGram SEP-24
```
