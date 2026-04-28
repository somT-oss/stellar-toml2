require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Keypair, Networks } = require("stellar-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// ── Validate required env vars ──────────────────────────────────────────────
const {
  STELLAR_SECRET_KEY,
  STELLAR_PUBLIC_KEY,
  JWT_SECRET,
  PORT = 3000,
  CLIENT_DOMAIN,
} = process.env;

if (!STELLAR_SECRET_KEY || !STELLAR_PUBLIC_KEY || !JWT_SECRET || !CLIENT_DOMAIN) {
  console.error(
    "❌  Missing required env vars. Check your .env file.\n" +
      "Required: STELLAR_SECRET_KEY, STELLAR_PUBLIC_KEY, JWT_SECRET, CLIENT_DOMAIN"
  );
  process.exit(1);
}

const serverKeypair = Keypair.fromSecret(STELLAR_SECRET_KEY);
const NETWORK_PASSPHRASE = Networks.TESTNET;
const HOME_DOMAIN = CLIENT_DOMAIN;

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SEP-10 server is running" });
});

// Serve stellar.toml
app.get("/.well-known/stellar.toml", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(`
VERSION="2.0.0"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"
SIGNING_KEY="${STELLAR_PUBLIC_KEY}"
ACCOUNTS=["${STELLAR_PUBLIC_KEY}"]
WEB_AUTH_ENDPOINT="https://${HOME_DOMAIN}/auth"

[DOCUMENTATION]
ORG_NAME="Test Wallet"
ORG_URL="https://${HOME_DOMAIN}"
`);
});

// SEP-10: GET /auth — issue challenge
app.get("/auth", async (req, res) => {
  const { account, client_domain, memo } = req.query;

  if (!account) {
    return res.status(400).json({ error: "account is required" });
  }

  try {
    const { buildChallengeTx } = require("stellar-sdk").Utils;

    const transaction = buildChallengeTx({
      serverKeypair,
      clientAccountID: account,
      homeDomain: HOME_DOMAIN,
      timebounds: 300, // 5 minutes
      networkPassphrase: NETWORK_PASSPHRASE,
      memo: memo || null,
      clientDomain: client_domain || null,
    });

    return res.json({ transaction, network_passphrase: NETWORK_PASSPHRASE });
  } catch (err) {
    console.error("GET /auth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// SEP-10: POST /auth — verify challenge and return JWT
app.post("/auth", async (req, res) => {
  const { transaction } = req.body;

  if (!transaction) {
    return res.status(400).json({ error: "transaction is required" });
  }

  try {
    const jwt = require("jsonwebtoken");
    const {
      readChallengeTx,
      verifyChallengeTxSigners,
    } = require("stellar-sdk").Utils;

    // Read and validate the challenge
    const { tx, clientAccountID, memo, matchedHomeDomain } = readChallengeTx({
      challengeTx: transaction,
      serverAccountID: STELLAR_PUBLIC_KEY,
      networkPassphrase: NETWORK_PASSPHRASE,
      domainNames: [HOME_DOMAIN],
    });

    // Verify signatures — client must have signed the challenge
    const signers = [clientAccountID];
    const { signersFound } = verifyChallengeTxSigners({
      challengeTx: transaction,
      serverAccountID: STELLAR_PUBLIC_KEY,
      networkPassphrase: NETWORK_PASSPHRASE,
      signers,
      domainNames: [HOME_DOMAIN],
    });

    if (!signersFound.length) {
      return res.status(400).json({ error: "No valid signers found" });
    }

    // Issue JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: `https://${HOME_DOMAIN}/auth`,
      sub: clientAccountID,
      iat: now,
      exp: now + 24 * 60 * 60, // 24 hours
    };

    if (memo) payload.memo = memo;

    const token = jwt.sign(payload, JWT_SECRET);
    return res.json({ token });
  } catch (err) {
    console.error("POST /auth error:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  SEP-10 server running on port ${PORT}`);
  console.log(`    Stellar.toml : http://localhost:${PORT}/.well-known/stellar.toml`);
  console.log(`    GET  /auth   : http://localhost:${PORT}/auth?account=G...`);
  console.log(`    POST /auth   : http://localhost:${PORT}/auth`);
});
