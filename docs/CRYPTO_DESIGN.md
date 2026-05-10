# GAW ModTools v10.11 -- Crypto Design

## Architecture

Token encryption was introduced in v10.11 (REDTEAM-1, T1) in response to a
red-team finding: `workerModToken` and `leadModToken` were stored in plaintext
inside `chrome.storage.local.gam_settings`. Local storage is readable by any
code running in the extension context and by a compromised extension install.

### Key lifecycle

- On first SW boot (install or update), `_cryptInit()` opens an IndexedDB
  database named `gam_crypt_db`, object store `keys`, key `device-v1`.
- If no key is stored, a new AES-GCM-256 `CryptoKey` is generated with
  `extractable: false`. This flag is permanent -- the key can never be
  exported or serialised by any Web Crypto API call.
- The `CryptoKey` object is stored directly in IDB. IDB preserves structured
  objects including CryptoKey instances across SW terminations.
- On subsequent boots, the stored `CryptoKey` is retrieved from IDB. The
  in-memory reference (`_deviceKey`) is discarded when the SW is evicted.

### Encryption

`_cryptEncrypt(plaintext)` generates a 12-byte random IV per call, runs
`crypto.subtle.encrypt({name:'AES-GCM', iv}, deviceKey, encoded)`, and
returns `{ct: base64, iv: base64, alg: 'AES-GCM-256-v1'}`. The IV is
always random; re-encrypting the same plaintext produces different ciphertext.

### Storage shape

Encrypted token blobs replace plaintext fields in `gam_settings`:

```
gam_settings.workerModToken_encrypted = {ct, iv, alg}
gam_settings.leadModToken_encrypted   = {ct, iv, alg}
gam_settings.workerModToken_issued_at  = <ms>
gam_settings.workerModToken_expires_at = <ms>  // 30-day default
gam_settings.leadModToken_issued_at    = <ms>
gam_settings.leadModToken_expires_at   = <ms>
```

Plaintext `workerModToken` / `leadModToken` fields are removed on write and
during migration.

### Migration

`_cryptMigrateSettings()` runs on every SW boot via `onInstalled` and
`onStartup`. It checks `gam_crypt_migrated_v1` flag; if unset, it reads
`gam_settings`, encrypts any plaintext token fields it finds, removes the
plaintext fields, writes the encrypted blobs, and sets the flag to `Date.now()`.

Mods do not need to re-authenticate. The migration is transparent.

### Read path

`loadSecrets()` reads `gam_settings` from `chrome.storage.local`, detects
encrypted blobs via `_cryptIsEncrypted()`, and decrypts them with `_cryptDecrypt()`.
Decrypted values populate the in-memory `secretCache` only; they are never
written back to disk in plaintext.

If decryption fails (key lost, IDB corrupted, storage tampered), `secretCache`
is zeroed for that token and the existing re-auth flow triggers.

### IDB unavailable fallback

If `indexedDB.open()` fails (unusual browser restriction), `_cryptInit()` throws
and `_deviceKey` remains null. All encrypt/decrypt calls then fail gracefully:
encrypt callers fall back to storing plaintext (belt-and-suspenders), and
decrypt callers return empty string. A warning is logged to `gam_diag_log`.
The popup Diag tab surfaces `idbAvailable: false` via the `cryptHealth` RPC.

## Threat model

### What encryption protects against

- **Physical disk access**: an attacker who dumps Chrome's LevelDB storage
  files directly gets ciphertext, not tokens.
- **Extension storage exfil via a compromised dependency**: a supply-chain
  attack that reads `chrome.storage.local` gets ciphertext only.
- **Key exfil**: the device key is `extractable: false`. Even with full
  extension-context code execution, `crypto.subtle.exportKey()` will throw.
  The key can be *used* (encrypt/decrypt) but never *read*.

### What encryption does NOT protect against

- **Attacker with full extension context at runtime**: if an attacker has
  arbitrary JS execution inside the extension service worker, they can call
  `_cryptDecrypt()` or read `secretCache` directly. The key cannot be
  exported, but the decrypted plaintext can be read from memory.
- **Attacker who controls the browser process**: full browser compromise
  bypasses all extension sandboxing.
- **Session storage**: `chrome.storage.session` holds plaintext tokens for
  the lifetime of a browser session (same threat model as pre-v10.11 local
  storage, but session-scoped). Session storage is cleared on browser close.
- **In-flight tokens**: tokens sent in HTTP headers to the worker are
  plaintext on the wire (TLS-protected end-to-end, but plaintext at SW RAM).

## Key rotation (v10.12+, out of scope for v10.11)

Key rotation requires re-encrypting all stored blobs with the new key before
deleting the old one. The recommended sequence:

1. Generate new key in IDB under `device-v2`.
2. Decrypt each blob with `device-v1`, re-encrypt with `device-v2`, write.
3. Flip active key pointer to `device-v2`.
4. Delete `device-v1` from IDB.

This is a two-phase commit pattern. Implement with a `gam_crypt_rotation_lock`
flag to detect interrupted rotations on next boot.

## Diagnostics

`_cryptHealth()` returns:

```
{
  cryptKeyPresent: bool,        // device key loaded in SW RAM
  idbAvailable: bool,           // IDB open succeeded
  encryptedTokensFound: 0|1|2,  // blobs present in gam_settings
  plaintextTokensFound: 0|1|2,  // residual plaintext (migration pending)
  lastMigrationTs: ms|null      // timestamp of last successful migration
}
```

Wired into the popup Diag tab via the `cryptHealth` runtime message and into
`gam_diag_log` via `_maintAppendDiag('crypt.health', ...)`.
