# Pathfinder FileGuard Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code'un aynı aktif ajan bağlamına daha önce başarıyla ulaştırılmış, aynı aralıktaki değişmemiş bir dosyayı ikinci kez `Read` ile yüklemesini güvenli biçimde engelleyen ücretsiz ve yerel bir eklenti üretmek.

**Architecture:** Eklenti `PreToolUse(Read)` sırasında dosyanın kimliğini ve SHA-256 özetini çıkarır; daha önce aynı oturum, ajan, bağlam nesli, yol, aralık ve içerik özetiyle tamamlanan bir okuma varsa çağrıyı çalışmadan reddeder. İzin verilen çağrı için `tool_use_id` ile geçici bir kayıt oluşturur; `PostToolUse(Read)` yalnızca başarılı çağrıdan sonra dosyanın hâlâ aynı olduğunu doğrulayıp kalıcı okuma kaydını yazar. `SessionStart` yeni/temizlenmiş/sıkıştırılmış bağlamı yönetir. Bütün durum verisi `${CLAUDE_PLUGIN_DATA}` altında içeriksiz ve oturum/ajan ayrımlı dosyalar hâlinde tutulur.

**Tech Stack:** Node.js 20+ ESM, yalnızca Node.js yerleşik modülleri, Claude Code 2.1.270+ plugin/hooks/skills sistemi, `node:test`, GitHub Actions.

**Spec:** [Türkçe onaylanmış tasarım](../specs/2026-09-15-pathfinder-fileguard-tasarim.tr.md) · [English approved design](../specs/2026-09-15-pathfinder-fileguard-design.md)

## Global Constraints

- FileGuard yalnızca Claude Code `Read` tekrarlarını kapsar. `Glob`, `Grep`, klasör tarama, hata döngüsü, dış servis, uzun belge doğrulama veya başka ajan ürünleri eklenmeyecek.
- Her belirsizlikte **fail-open** uygulanacak: FileGuard'ın kendi hatası gerekli bir okumayı durdurmayacak.
- Dosya içeriği, istem, model yanıtı, API anahtarı veya ortam değişkeni saklanmayacak.
- Dosya içeriği yalnızca akış hâlinde SHA-256 hesaplamak ve başarılı okuma öncesi/sonrası değişmediğini doğrulamak için yerelde okunacak.
- Çalışma zamanında üçüncü taraf paket, model, API, telemetri veya ağ çağrısı bulunmayacak.
- Her davranış önce başarısız testle tanımlanacak, ardından en küçük uygulama yazılacak.
- Her görev kendi testleri geçtikten sonra ayrı bir Git commit'i ile kapanacak.
- Tasarımdaki “sıkıştırma sonrası yeni bağlam” davranışı ayrı `PostCompact` hook'u yerine Claude Code'un sıkıştırma tamamlandıktan sonra gönderdiği `SessionStart.source === "compact"` olayıyla uygulanacak. Böylece `/clear` ve `compact` aynı yaşam döngüsü yöneticisinde ele alınacak ve nesil iki kez artırılmayacak.
- Aynı anda başlayan iki ilk okuma, ikisinden biri başarıyla tamamlanmadan kanıtlanmış tekrar sayılamaz. İlk beta bu nadir paralel yarışı engellemez; bunu sınırlamalar belgesi açıkça söyleyecek.
- İlk beta bütün normal dosyaları özetleyebilir; yaklaşık token hesabı yalnızca `tool_response` içinden güvenle ölçülen metin karakterleri için yapılacak. Görsel/PDF/bilinmeyen çıktılarda okuma engellenebilir fakat tasarruf karakteri ve tokenı “ölçülemedi” olarak kalacak.

## Dosya Haritası

```text
Pathfinder-FileGuard/
├── .claude-plugin/
│   └── marketplace.json                    # GitHub üzerinden eklenti kataloğu
├── .github/workflows/test.yml               # Windows/macOS/Linux test matrisi
├── docs/
│   ├── tr/KULLANIM.md                       # Taylan ve Türkçe kullanıcılar için rehber
│   └── superpowers/
│       ├── specs/                           # Onaylanmış tasarımlar
│       └── plans/                           # Bu uygulama planı
├── plugins/fileguard/
│   ├── .claude-plugin/plugin.json           # Eklenti kimliği: fileguard
│   ├── hooks/hooks.json                     # SessionStart, PreToolUse, PostToolUse
│   ├── skills/
│   │   ├── allow-next/SKILL.md              # /fileguard:allow-next
│   │   └── report/SKILL.md                  # /fileguard:report [--hide-paths]
│   ├── scripts/
│   │   ├── commands/
│   │   │   ├── allow-next.mjs               # Tek kullanımlık izin üretir
│   │   │   └── report.mjs                   # Yerel tasarruf raporu üretir
│   │   └── hooks/
│   │       ├── post-read.mjs                # Hook giriş noktası
│   │       ├── pre-read.mjs                 # Hook giriş noktası
│   │       └── session-start.mjs            # Hook giriş noktası
│   └── src/
│       ├── diagnostics.mjs                  # İçeriksiz yerel hata kaydı
│       ├── file-snapshot.mjs                # Akışlı SHA-256 ve yarış kontrolü
│       ├── hook-io.mjs                      # stdin JSON ve hook çıktısı
│       ├── identity.mjs                     # Yol/aralık/oturum/ajan kimliği
│       ├── measure-response.mjs             # Güvenli karakter ölçümü
│       ├── post-read.mjs                    # Başarılı okumayı kaydetme mantığı
│       ├── pre-read.mjs                     # Engelleme kararı
│       ├── report.mjs                       # Rapor toplama/biçimleme
│       ├── session-start.mjs                # Bağlam nesli ve ortam değişkeni
│       └── state-store.mjs                  # İçeriksiz, eşzamanlılığa dayanıklı kayıtlar
├── test/
│   ├── fixtures/hook-payloads.mjs           # Yapay Claude Code girdileri
│   ├── helpers/run-hook.mjs                  # Hook'ları çocuk süreçte çalıştırır
│   ├── integration/                         # Uçtan uca hook senaryoları
│   └── unit/                                # Saf modül testleri
├── .gitignore
├── LICENSE
├── LIMITATIONS.md
├── PRIVACY.md
├── README.md                                # İngilizce GitHub ana sayfası
└── package.json
```

---

### Task 1: Depo ve Claude Code eklenti iskeleti

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/fileguard/.claude-plugin/plugin.json`
- Create: `plugins/fileguard/hooks/hooks.json`
- Create: `test/unit/plugin-contract.test.mjs`

- [ ] **Step 1: Önce manifest sözleşme testini yaz**

`test/unit/plugin-contract.test.mjs` şu sözleşmeleri doğrulasın:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));

test("marketplace exposes one local fileguard plugin", async () => {
  const marketplace = await json(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "pathfinder-tools");
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [{ name: "fileguard", source: "./plugins/fileguard" }],
  );
});

test("plugin name preserves /fileguard:* namespace", async () => {
  const manifest = await json("plugins/fileguard/.claude-plugin/plugin.json");
  assert.equal(manifest.name, "fileguard");
  assert.equal(manifest.license, "MIT");
});

test("hooks target only Read plus session lifecycle", async () => {
  const config = await json("plugins/fileguard/hooks/hooks.json");
  assert.equal(config.hooks.PreToolUse[0].matcher, "Read");
  assert.equal(config.hooks.PostToolUse[0].matcher, "Read");
  assert.ok(config.hooks.SessionStart);
  assert.equal(config.hooks.Glob, undefined);
  assert.equal(config.hooks.Grep, undefined);
});
```

- [ ] **Step 2: Testi çalıştır ve beklenen kırmızı sonucu gör**

Run: `node --test test/unit/plugin-contract.test.mjs`

Expected: `ENOENT` nedeniyle başarısız.

- [ ] **Step 3: Paket ve manifest dosyalarını oluştur**

`package.json`:

```json
{
  "name": "pathfinder-fileguard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "test:unit": "node --test test/unit",
    "test:integration": "node --test test/integration"
  }
}
```

`plugins/fileguard/.claude-plugin/plugin.json`:

```json
{
  "name": "fileguard",
  "displayName": "Pathfinder FileGuard",
  "version": "0.1.0",
  "description": "Blocks proven duplicate reads of unchanged files in the same Claude Code context.",
  "author": {
    "name": "TaylanPekbilek",
    "email": "taylan.pekbilek@gmail.com"
  },
  "license": "MIT",
  "keywords": ["claude-code", "tokens", "context", "read", "local"]
}
```

`.claude-plugin/marketplace.json` yalnızca `fileguard` girdisini ve `./plugins/fileguard` kaynağını içersin. `hooks/hooks.json` exec biçiminde `node` komutu ve `${CLAUDE_PLUGIN_ROOT}` altındaki üç giriş noktasını kullansın:

```json
{
  "description": "Pathfinder FileGuard lifecycle and read protection hooks",
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-start.mjs"],
        "timeout": 5
      }]
    }],
    "PreToolUse": [{
      "matcher": "Read",
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-read.mjs"],
        "timeout": 10
      }]
    }],
    "PostToolUse": [{
      "matcher": "Read",
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/post-read.mjs"],
        "timeout": 10
      }]
    }]
  }
}
```

MIT metninde telif sahibi `TaylanPekbilek`, yıl `2026` olsun. `.gitignore` yalnızca yerel test/artifact girdilerini (`node_modules/`, `coverage/`, `.fileguard-test-data/`, `*.tmp`) dışlasın.

- [ ] **Step 4: Sözleşme ve resmi Claude doğrulayıcısını çalıştır**

Run: `npm test`

Expected: `3` test geçer.

Run: `claude plugin validate .`

Expected: marketplace ve yerel plugin kaynağı geçerli.

Run: `claude plugin validate ./plugins/fileguard`

Expected: plugin manifesti ve hooks şeması geçerli.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore LICENSE .claude-plugin plugins/fileguard test/unit/plugin-contract.test.mjs
git commit -m "chore: scaffold FileGuard plugin"
```

---

### Task 2: Hook iletişimi, kimlik ve güvenli dosya özeti

**Files:**
- Create: `plugins/fileguard/src/hook-io.mjs`
- Create: `plugins/fileguard/src/identity.mjs`
- Create: `plugins/fileguard/src/file-snapshot.mjs`
- Create: `plugins/fileguard/src/measure-response.mjs`
- Create: `test/unit/hook-io.test.mjs`
- Create: `test/unit/identity.test.mjs`
- Create: `test/unit/file-snapshot.test.mjs`
- Create: `test/unit/measure-response.test.mjs`

- [ ] **Step 1: Hook JSON giriş/çıkış testlerini yaz**

Testler geçerli JSON'u ayrıştırmayı, boş/bozuk stdin'i reddetmeyi ve engel çıktısının yalnızca desteklenen Claude alanlarını taşımasını doğrulasın:

```js
assert.deepEqual(denyRead("duplicate"), {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "duplicate",
  },
});
```

Uygulama API'si:

```js
export async function readHookInput(stream = process.stdin) {}
export function denyRead(reason) {}
export function writeHookOutput(value, stream = process.stdout) {}
```

`readHookInput` 1 MiB üzerinde girdiyi reddetsin; böylece bozuk bir hook yükü sınırsız belleğe alınmasın. Giriş noktaları bu hatayı yakalayıp `0` ile çıkacağı için ürün davranışı yine fail-open kalacak.

- [ ] **Step 2: Yol, aralık ve ajan kimliği testlerini yaz**

Şu örnekleri sabitle:

```js
assert.equal(normalizePathKey("C:\\Work\\Src\\APP.ts", "win32"), "c:\\work\\src\\app.ts");
assert.equal(normalizePathKey("C:/Work/Src/APP.ts", "win32"), "c:\\work\\src\\app.ts");
assert.notEqual(
  normalizePathKey("/Work/APP.ts", "linux"),
  normalizePathKey("/work/app.ts", "linux"),
);
assert.deepEqual(normalizeRange({}), { offset: null, limit: null });
assert.deepEqual(normalizeRange({ offset: 10, limit: 50 }), { offset: 10, limit: 50 });
assert.equal(agentKey({}), "main");
assert.notEqual(agentKey({ agent_id: "agent-a" }), agentKey({ agent_id: "agent-b" }));
```

Geçersiz, negatif, kesirli veya güvenli tamsayı olmayan `offset`/`limit` değerleri hata üretsin; hook giriş noktası bu durumda okumaya izin versin.

- [ ] **Step 3: Akışlı SHA-256 testlerini yaz**

`snapshotFile(path)` şu sözleşmeye sahip olsun:

```js
{
  digest: "64-character-lowercase-hex",
  size: 123,
  mtimeNs: "1789000000000000000"
}
```

Testler aynı içeriğin aynı özeti, değişen içeriğin farklı özeti verdiğini; klasör, kayıp dosya ve okuma sırasında değişen dosyanın güvenli hata oluşturduğunu doğrulasın. Hash `createReadStream` + `createHash("sha256")` ile hesaplanmalı; `readFile` ile bütün dosya belleğe alınmamalı.

Önce ve sonra `stat(path, { bigint: true })` al; boyut veya `mtimeNs` değişirse `FileChangedDuringSnapshotError` fırlat:

```js
const stable = before.size === after.size && before.mtimeNs === after.mtimeNs;
if (!stable) throw new FileChangedDuringSnapshotError(filePath);
```

- [ ] **Step 4: Teslim edilen metni ölçme testlerini yaz**

Yalnızca şu güvenli şekiller ölçülsün:

```js
measureResponseText("abc") === 3;
measureResponseText({ content: "abc" }) === 3;
measureResponseText({ content: [{ type: "text", text: "abc" }] }) === 3;
measureResponseText({ filePath: "/secret/name", success: true }) === null;
```

Genel nesneyi JSON'a çevirip uzunluğunu alma; bu, yol ve meta veriyi yanlışlıkla “teslim edilen içerik” sayar. Sonuç `number | null` olsun.

- [ ] **Step 5: Testleri kırmızı çalıştır, sonra dört modülü uygula**

Run: `node --test test/unit/hook-io.test.mjs test/unit/identity.test.mjs test/unit/file-snapshot.test.mjs test/unit/measure-response.test.mjs`

Expected before implementation: module-not-found.

Expected after implementation: bütün testler geçer.

- [ ] **Step 6: Commit**

```bash
git add plugins/fileguard/src test/unit
git commit -m "feat: add read identity and snapshot primitives"
```

---

### Task 3: İçeriksiz ve eşzamanlılığa dayanıklı yerel durum deposu

**Files:**
- Create: `plugins/fileguard/src/state-store.mjs`
- Create: `plugins/fileguard/src/diagnostics.mjs`
- Create: `test/unit/state-store.test.mjs`
- Create: `test/unit/diagnostics.test.mjs`

- [ ] **Step 1: Durum yerleşimini testle tanımla**

Kullanıcıdan gelen ham oturum ve ajan kimlikleri klasör adı yapılmasın. SHA-256'nın ilk 32 hex karakterini kullanan `opaqueKey` ile şu yerleşim oluşsun:

```text
${CLAUDE_PLUGIN_DATA}/v1/sessions/<session-key>/
├── contexts/<createdAt>-<uuid>.json
├── agents/<agent-key>/
│   ├── <context-id>/pending/<tool-use-key>.json
│   ├── <context-id>/reads/<read-key>/<digest>.json
│   ├── events/<createdAt>-<uuid>.json
│   └── overrides/<createdAt>-<uuid>.json
└── diagnostics/<createdAt>-<uuid>.json
```

Bağlam, okuma, olay ve izin kayıtları benzersiz dosyalardır; ortak bir büyük JSON dosyası tekrar yazılmaz. Böylece farklı ajanların eşzamanlı yazıları birbirini ezmez.

- [ ] **Step 2: Saklanabilecek alanları allowlist testiyle sınırla**

`writeReadRecord` yalnızca şunları yazsın:

```js
const STORED_READ_FIELDS = [
  "path",
  "pathKey",
  "offset",
  "limit",
  "size",
  "mtimeNs",
  "digest",
  "deliveredChars",
  "measurement",
  "readAt",
];
```

Test girdisine `content`, `prompt`, `tool_response`, `apiKey` ve `environment` ekle; diskteki JSON'da bu anahtarların hiçbirinin bulunmadığını doğrula. Depo API'si bilinmeyen alanları yaymak yerine yeni allowlist nesnesi kurmalı.

- [ ] **Step 3: Bağlam ve okuma API testlerini yaz**

Uygulanacak API:

```js
export function createStateStore({ rootDir, now, randomUUID }) {
  return {
    ensureContext,
    advanceContext,
    currentContext,
    writePending,
    readPending,
    writeReadRecord,
    findReadRecord,
    writeBlockedEvent,
    listBlockedEvents,
    armOverride,
    consumeOverride,
    cleanupExpiredSessions,
    writeDiagnostic,
  };
}
```

Testler şunları kanıtlasın:

- `ensureContext` ilk kullanımda `ordinal: 0` üretir, ikinci çağrıda yeni nesil üretmez.
- `advanceContext("compact")` ve `advanceContext("clear")` yeni bir `contextId` ile sırayı bir artırır.
- Resume mevcut nesli değiştirmez.
- Aynı yol/aralık fakat farklı digest için ayrı kayıt bulunur.
- Farklı session/agent/context hiçbir zaman birbirinin kaydını bulamaz.
- Aynı hedefe 25 eşzamanlı yazı geçerli JSON dosyaları bırakır.
- Bir override dosyasını iki eşzamanlı tüketiciden yalnızca biri atomik `rename` ile alabilir.
- Süresi dolmuş override tüketilmez.
- 30 günden eski oturum yalnızca `rootDir/v1/sessions` altında ve containment kontrolünden sonra silinir.

- [ ] **Step 4: Tanı kaydını içeriksiz uygula**

Tanı kaydı sadece şu yapıda olsun:

```js
{
  "code": "STATE_UNAVAILABLE",
  "hook": "PreToolUse",
  "at": "2026-09-15T00:00:00.000Z"
}
```

Hata mesajı, stack trace, dosya içeriği ve hook payload'ı diske yazılmasın. Geliştirici testlerinde ayrıntılı hata yalnızca süreç stderr'ine, `FILEGUARD_DEBUG=1` açıkken yazılabilir.

- [ ] **Step 5: Kırmızı/yeşil testi çalıştır**

Run: `node --test test/unit/state-store.test.mjs test/unit/diagnostics.test.mjs`

Expected: uygulamadan önce başarısız, uygulamadan sonra bütün testler geçer.

- [ ] **Step 6: Commit**

```bash
git add plugins/fileguard/src/state-store.mjs plugins/fileguard/src/diagnostics.mjs test/unit
git commit -m "feat: add private local state store"
```

---

### Task 4: Oturum başlangıcı, `/clear` ve sıkıştırma yaşam döngüsü

**Files:**
- Create: `plugins/fileguard/src/session-start.mjs`
- Create: `plugins/fileguard/scripts/hooks/session-start.mjs`
- Create: `test/fixtures/hook-payloads.mjs`
- Create: `test/helpers/run-hook.mjs`
- Create: `test/integration/session-lifecycle.test.mjs`

- [ ] **Step 1: Gerçekçi SessionStart fixture'larını oluştur**

`test/fixtures/hook-payloads.mjs` şu fabrika fonksiyonunu sunsun:

```js
export const sessionStart = (overrides = {}) => ({
  session_id: "session-a",
  transcript_path: "/tmp/session-a.jsonl",
  cwd: "/tmp/project",
  hook_event_name: "SessionStart",
  source: "startup",
  model: "claude-sonnet-5",
  ...overrides,
});
```

Fixture içindeki model adı davranışta kullanılmasın ve diske yazılmasın.

- [ ] **Step 2: Çocuk süreç test yardımcısını yaz**

`runHook` script yolunu, payload'ı, geçici `CLAUDE_PLUGIN_DATA` klasörünü ve isteğe bağlı ortam değişkenlerini alsın; `spawn(process.execPath, [script])` ile JSON'u stdin'e yazsın, stdout/stderr/exit code döndürsün. Shell kullanma; böylece Windows boşlukları ve kaçışları testte sorun çıkarmaz.

- [ ] **Step 3: Yaşam döngüsü entegrasyon testlerini yaz**

Senaryolar:

1. `startup` → ordinal `0`.
2. `resume` → aynı context id.
3. `compact` → ordinal `1` ve yeni context id.
4. `clear` → ordinal `2` ve yeni context id.
5. Farklı session → kendi ordinal `0`.
6. Eksik/bozuk payload → exit `0`, stdout boş, normal Claude akışı engellenmez.

`CLAUDE_ENV_FILE` verilen testte script şu satırı güvenli POSIX shell kaçışıyla eklesin:

```text
export FILEGUARD_SESSION_ID='session-a'
```

Oturum kimliği tek tırnak içerirse `'` → `'"'"'` biçiminde kaçırılsın. Ham kimlik FileGuard durum klasörü adı yapılmasın.

- [ ] **Step 4: En küçük yaşam döngüsü uygulamasını yaz**

Karar tablosu:

| `source` | Davranış |
|---|---|
| `startup` | Context yoksa oluştur; varsa dokunma |
| `resume` | Mevcut context'i koru; yoksa oluştur |
| `compact` | Yeni context nesli oluştur |
| `clear` | Yeni context nesli oluştur |
| bilinmeyen | Fail-open; context yoksa oluştur |

Giriş noktası yalnızca `main(input)` çağırıp tüm hataları yakalasın; hiçbir hata için non-zero çıkış üretmesin.

- [ ] **Step 5: Test ve commit**

Run: `node --test test/integration/session-lifecycle.test.mjs`

Expected: bütün senaryolar geçer.

```bash
git add plugins/fileguard/src/session-start.mjs plugins/fileguard/scripts/hooks/session-start.mjs test/fixtures test/helpers test/integration/session-lifecycle.test.mjs
git commit -m "feat: track FileGuard context lifecycle"
```

---

### Task 5: İlk başarılı okumayı güvenli biçimde kaydetme

**Files:**
- Create: `plugins/fileguard/src/pre-read.mjs`
- Create: `plugins/fileguard/src/post-read.mjs`
- Create: `plugins/fileguard/scripts/hooks/pre-read.mjs`
- Create: `plugins/fileguard/scripts/hooks/post-read.mjs`
- Create: `test/integration/read-recording.test.mjs`

- [ ] **Step 1: Önce başarılı/başarısız okuma senaryolarını yaz**

PreToolUse fixture:

```js
export const preRead = (filePath, overrides = {}) => ({
  session_id: "session-a",
  cwd: "/tmp/project",
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: filePath },
  tool_use_id: "tool-read-1",
  ...overrides,
});
```

PostToolUse fixture aynı `tool_use_id`, `tool_input` ve aşağıdaki yanıtı kullansın:

```js
tool_response: {
  content: [{ type: "text", text: "first line\nsecond line\n" }],
}
```

Testler:

- İlk PreToolUse exit `0`, stdout boş ve pending kayıt oluşturur.
- Eşleşen başarılı PostToolUse kalıcı read record yazar.
- PostToolUse çalışmazsa kalıcı record oluşmaz.
- `PostToolUseFailure` hook'u olmadığı için başarısız okuma hiçbir engel kaydı oluşturmaz.
- Pre ve Post arasında dosya değişirse kalıcı record oluşmaz.
- `tool_use_id`, yol veya aralık eşleşmiyorsa record oluşmaz.
- Post hook'a pending bulunmadan gelinirse fail-open davranıp record oluşturmaz.
- Kayıtta ölçülen karakter vardır fakat `tool_response` veya metin içeriği yoktur.

- [ ] **Step 2: Pre-read'in kayıt hazırlama bölümünü uygula**

Akış:

1. Hook türünü, tool adını ve zorunlu alanları doğrula.
2. Gerçek yolu ve aralığı standartlaştır.
3. Güncel context'i al.
4. Dosyayı akışlı SHA-256 ile özetle.
5. `tool_use_id`, kimlik ve snapshot meta verisini pending olarak yaz.
6. JSON basmadan exit `0` ile okumaya izin ver.

Bu görevde henüz duplicate engelleme ekleme; kırmızı testin kapsamını küçük tut.

- [ ] **Step 3: Post-read doğrulamasını uygula**

Akış:

1. Aynı session/agent/context/tool-use pending kaydını bul.
2. Gelen yol ve aralığın pending ile eşleştiğini doğrula.
3. Dosyanın yeni snapshot'ını al.
4. Yeni digest/size/mtime, PreToolUse snapshot'ıyla aynı değilse kayıt oluşturma.
5. Güvenli biçimde ölçülebilen karakter sayısını çıkar.
6. Allowlist read record'unu `<read-key>/<digest>.json` olarak yaz.

Record zamanı PostToolUse zamanıdır; snapshot zamanı ayrıca saklanmaz. Aynı digest kaydı mevcutsa idempotent kabul et.

- [ ] **Step 4: Fail-open sınır testlerini çalıştır**

Geçici durum klasörünü salt-okunur yapma platformlar arasında güvenilir değildir. Bunun yerine modül testinde hata atan store/snapshot bağımlılığı enjekte et ve `runPreRead`/`runPostRead` fonksiyonlarının hata fırlatmadığını, engel çıktısı döndürmediğini doğrula.

Run: `node --test test/integration/read-recording.test.mjs`

Expected: bütün senaryolar geçer.

- [ ] **Step 5: Commit**

```bash
git add plugins/fileguard/src/pre-read.mjs plugins/fileguard/src/post-read.mjs plugins/fileguard/scripts/hooks test/integration/read-recording.test.mjs test/fixtures/hook-payloads.mjs
git commit -m "feat: record successful Claude reads"
```

---

### Task 6: Kanıtlanmış değişmemiş tekrarı Read çalışmadan engelleme

**Files:**
- Modify: `plugins/fileguard/src/pre-read.mjs`
- Create: `test/integration/duplicate-guard.test.mjs`

- [ ] **Step 1: Tam engel/izin matrisini kırmızı test olarak yaz**

Her test ayrı geçici plugin-data klasörü kullansın. En az şu senaryoları kapsa:

| Senaryo | Beklenen |
|---|---|
| İlk okuma | izin |
| Başarıyla kaydedilmiş aynı session/agent/context/path/range/digest | engel |
| Aynı yol ve aralık, değişmiş içerik | izin |
| Aynı dosya, farklı `offset` | izin |
| Aynı dosya, farklı `limit` | izin |
| Tam okuma ile aralıklı okuma | izin |
| Önceki okuma başarısız | izin |
| Farklı session | izin |
| Main ile subagent | izin |
| İki farklı `agent_id` | izin |
| Compact/clear sonrası | izin |
| Silinmiş/kayıp dosya | izin; Claude'un normal Read hatasına bırak |
| Bozuk state kaydı | izin |
| Snapshot hatası | izin |
| Windows yol harfi/ayraç varyasyonu, aynı gerçek dosya | engel |
| Linux/macOS harf farkı | ayrı kimlik; izin |

- [ ] **Step 2: Engel mesajı sözleşmesini sabitle**

Mesaj kısa, eyleme dönük ve doğrulanabilir olsun:

```text
FileGuard blocked an unchanged duplicate read of "src/example.ts" for the same requested range. This range was already delivered in the current agent context and its SHA-256 digest is unchanged. Read a different range or run /fileguard:allow-next for one bypass.
```

Mutlak yol yerine mümkünse `cwd`'ye göre göreli yolu göster. Dosya cwd dışındaysa normalleştirilmiş mutlak yolu göster. Mesaj kesin token veya para tasarrufu iddia etmesin.

JSON sözleşmesi:

```js
{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: message,
  },
}
```

- [ ] **Step 3: Engelleme kararını uygula**

Pre-read snapshot'ından sonra:

```js
const previous = await store.findReadRecord({
  sessionId,
  agentId,
  contextId,
  readKey,
  digest: snapshot.digest,
});

if (previous) {
  const bypassed = await store.consumeOverride({ sessionId, agentId, now: now() });
  if (!bypassed) {
    await store.writeBlockedEvent(eventFrom(previous));
    return denyRead(formatDuplicateMessage(identity, input.cwd));
  }
}
```

Override henüz bu görevde üretilmeyecek; `consumeOverride` kayıt yokken `false` döner. Engel olayını yazmak başarısız olursa yine de kanıtlanmış tekrar engellenebilir; fakat read record'u okumak veya snapshot doğrulamak başarısızsa izin verilir.

- [ ] **Step 4: Tüm testleri ve plugin doğrulamasını çalıştır**

Run: `npm test`

Expected: bütün unit/integration testleri geçer.

Run: `claude plugin validate ./plugins/fileguard`

Expected: valid.

- [ ] **Step 5: Commit**

```bash
git add plugins/fileguard/src/pre-read.mjs test/integration/duplicate-guard.test.mjs
git commit -m "feat: block proven duplicate reads"
```

---

### Task 7: Beş dakikalık tek kullanımlık `/fileguard:allow-next`

**Files:**
- Create: `plugins/fileguard/scripts/commands/allow-next.mjs`
- Create: `plugins/fileguard/skills/allow-next/SKILL.md`
- Create: `test/integration/override.test.mjs`
- Modify: `test/unit/plugin-contract.test.mjs`

- [ ] **Step 1: Override davranışını kırmızı testle tanımla**

Senaryo:

1. Aynı okuma başarıyla kaydedilir.
2. Tekrar engellenir.
3. `allow-next.mjs` mevcut session/main agent için izin oluşturur.
4. Aynı tekrar bir kez geçer ve pending + başarılı record akışı normal çalışır.
5. Sonraki aynı tekrar yeniden engellenir.
6. 5 dakika 1 milisaniye sonra kullanılmamış izin geçersizdir.
7. Farklı session veya subagent izni tüketemez.
8. `FILEGUARD_SESSION_ID` yoksa komut hata kodu verir ve kullanıcıya “Claude Code oturumunu eklenti etkin şekilde yeniden başlatın” der; genel izin oluşturmaz.

- [ ] **Step 2: Komut scriptini uygula**

CLI yalnızca şu bağımsız değişkenleri kabul etsin:

```text
--data-dir <absolute-path>
--session <session-id>
```

Skill bu değerleri Claude'un sağladığı `${CLAUDE_PLUGIN_DATA}` ve SessionStart'ta üretilen `$FILEGUARD_SESSION_ID` üzerinden verir. Komut `main` ajanı için `expiresAt = now + 300_000` kaydeder ve yalnızca şunu basar:

```text
FileGuard: the next otherwise-blocked read in this session may proceed once. The bypass expires in 5 minutes.
```

- [ ] **Step 3: Kullanıcı tarafından çağrılan skill'i ekle**

`plugins/fileguard/skills/allow-next/SKILL.md`:

```md
---
name: allow-next
description: Arm one five-minute bypass for the next otherwise-blocked FileGuard read in the current Claude Code session.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/allow-next.mjs" *)
---

Run exactly this command once:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/allow-next.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID"`

Return the command's stdout verbatim. Do not read project files and do not perform any other action.
```

Manifest adı `fileguard` olduğu için resmi namespace testi komutun `/fileguard:allow-next` olarak keşfedildiğini doğrulasın. Skill'in kısa açıklaması her turda gereksiz bağlam oluşturmaması için tek cümle kalsın ve `disable-model-invocation: true` ile yalnızca kullanıcı tarafından çağrılsın.

- [ ] **Step 4: Test, plugin validate ve commit**

Run: `node --test test/integration/override.test.mjs test/unit/plugin-contract.test.mjs`

Expected: bütün testler geçer.

Run: `claude plugin validate ./plugins/fileguard`

Expected: skill frontmatter valid.

```bash
git add plugins/fileguard/scripts/commands/allow-next.mjs plugins/fileguard/skills/allow-next test/integration/override.test.mjs test/unit/plugin-contract.test.mjs
git commit -m "feat: add one-read FileGuard bypass"
```

---

### Task 8: Ölçülü ve yolları gizleyebilen `/fileguard:report`

**Files:**
- Create: `plugins/fileguard/src/report.mjs`
- Create: `plugins/fileguard/scripts/commands/report.mjs`
- Create: `plugins/fileguard/skills/report/SKILL.md`
- Create: `test/unit/report.test.mjs`
- Create: `test/integration/report-command.test.mjs`

- [ ] **Step 1: Rapor matematiğini testle tanımla**

Üç olay kullan:

```js
[
  { path: "/project/a.js", deliveredChars: 400, blockedAt: "2026-09-15T10:00:00Z" },
  { path: "/project/b.js", deliveredChars: 800, blockedAt: "2026-09-15T10:01:00Z" },
  { path: "/project/image.png", deliveredChars: null, blockedAt: "2026-09-15T10:02:00Z" },
]
```

Beklenen:

- blocked reads: `3`
- measured prevented characters: `1,200`
- unmeasured blocked reads: `1`
- approximate tokens: `300` (`Math.floor(chars / 4)`)
- largest measured duplicate: `800`
- current session filtresi başka session olaylarını dışlar
- retained total 30 günlük mevcut session klasörlerini kapsar
- `hidePaths: true` çıktısında `a.js`, `b.js`, mutlak yol ve klasör adı bulunmaz; `File #1`, `File #2` kullanılır
- para değeri veya `$` işareti bulunmaz

- [ ] **Step 2: Rapor toplayıcı ve biçimleyiciyi uygula**

İki saf fonksiyon sun:

```js
export function summarizeBlockedReads(events, { currentSessionKey }) {}
export function formatReport(summary, { hidePaths = false }) {}
```

Başlıklar:

```text
Pathfinder FileGuard report
Current session
Retained local history (30 days)
Measurement notes
```

Notlar açıkça şunu söylemeli: karakter sayıları önceki başarılı Read yanıtından ölçülür; token sayısı `characters / 4` yönsel tahminidir ve faturalanmış kullanım değildir.

- [ ] **Step 3: CLI argümanlarını güvenli biçimde uygula**

Kabul edilen biçimler:

```text
report.mjs --data-dir <path> --session <id>
report.mjs --data-dir <path> --session <id> --hide-paths
```

Bilinmeyen argüman non-zero ve tek satırlık kullanım mesajı üretir. `--data-dir` ve `--session` zorunludur. Rapor ağ erişimi yapmaz.

- [ ] **Step 4: Skill dosyasını ekle**

Skill `disable-model-invocation: true` olsun. `$ARGUMENTS` doğrudan shell komutuna eklenmesin. Skill talimatı yalnızca boş argüman veya tam `--hide-paths` değerini kabul edip aşağıdaki iki sabit komuttan birini çalıştırmayı söylesin:

```text
node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/report.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID"
node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/report.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID" --hide-paths
```

Başka argümanda araç çağrısı yapmadan şu kullanımı göster: `/fileguard:report [--hide-paths]`.

- [ ] **Step 5: Test ve commit**

Run: `node --test test/unit/report.test.mjs test/integration/report-command.test.mjs`

Expected: bütün testler geçer.

```bash
git add plugins/fileguard/src/report.mjs plugins/fileguard/scripts/commands/report.mjs plugins/fileguard/skills/report test/unit/report.test.mjs test/integration/report-command.test.mjs
git commit -m "feat: report measured FileGuard savings"
```

---

### Task 9: Gizlilik, sınırlamalar, İngilizce ana sayfa ve Türkçe kullanım rehberi

**Files:**
- Create: `README.md`
- Create: `PRIVACY.md`
- Create: `LIMITATIONS.md`
- Create: `docs/tr/KULLANIM.md`
- Create: `test/unit/documentation-contract.test.mjs`

- [ ] **Step 1: Belge sözleşme testini önce yaz**

Test şu ifadelerin belgelerde gerçekten yer aldığını doğrulasın:

- Ücretsiz ve MIT.
- Tamamen yerel, telemetrisiz ve dış API'siz.
- Yalnızca kanıtlanmış aynı `Read` tekrarını engeller.
- Fail-open.
- `${CLAUDE_PLUGIN_DATA}` altında tutulan alanların listesi.
- 30 günlük saklama.
- Yaklaşık token hesabının faturalama olmadığı.
- `@file` biçimindeki doğrudan dosya referanslarının `PreToolUse` hook'unu atlayabildiği.
- Eşzamanlı başlayan iki ilk okumanın v1'de engellenmeyebileceği.
- Kurulum, devre dışı bırakma ve kaldırma adımları.
- `/fileguard:allow-next` ve `/fileguard:report --hide-paths`.
- README sonunda onaylanan destek çağrısı.
- Gelecekteki ürün yol haritası bulunmaması.

- [ ] **Step 2: İngilizce README'yi yaz**

README sırası:

1. Tek cümlelik vaat.
2. 20 saniyelik before/after örneği.
3. Ne zaman engeller / ne zaman izin verir tablosu.
4. Yerel geliştirme kurulumu: `claude --plugin-dir ./plugins/fileguard`.
5. GitHub marketplace kurulumu:
   - `/plugin marketplace add TaylanPekbilek/Pathfinder-FileGuard`
   - `/plugin install fileguard@pathfinder-tools`
6. Override ve report.
7. Gizlilik ve sınırlamalara bağlantı.
8. Geliştirme/test.
9. MIT lisansı.
10. Tam şu CTA:

```text
If FileGuard saves you time or tokens, please consider starring the repository and sharing it with other Claude Code users. Your experience and feedback will help guide the useful tools we build next.
```

- [ ] **Step 3: Türkçe kullanım rehberini yaz**

Teknik terimleri kısa Türkçe açıklamalarla ver. Aynı kurulum/komutları koru. En sonda onaylanan Türkçe CTA aynen yer alsın:

```text
FileGuard size zaman veya token kazandırdıysa GitHub deposuna yıldız vererek ve Claude Code kullanan dostlarınızla paylaşarak destek olabilirsiniz. Deneyimleriniz ve geri bildirimleriniz, gelecekte geliştireceğimiz yararlı araçlara yön verecektir.
```

- [ ] **Step 4: Gizlilik ve sınırlama belgelerini yaz**

`PRIVACY.md` saklanan alanları ve saklanmayan içerikleri tabloyla ayırsın. `LIMITATIONS.md`, FileGuard'ın token sayacını değil gereksiz içerik girişini önlediğini; cache/billing davranışının Claude planına göre değişebileceğini; doğrudan `@file` referansları ile eşzamanlı ilk okumaların koruma dışında kalabileceğini açıkça söylesin.

- [ ] **Step 5: Test, yer tutucu taraması ve commit**

Run: `node --test test/unit/documentation-contract.test.mjs`

Expected: geçer.

Run: `rg -n "TODO|TBD|GÖREVİ BURAYA YAZ|future roadmap|gelecekteki ürün" README.md PRIVACY.md LIMITATIONS.md docs/tr plugins/fileguard`

Expected: sonuç yok.

```bash
git add README.md PRIVACY.md LIMITATIONS.md docs/tr/KULLANIM.md test/unit/documentation-contract.test.mjs
git commit -m "docs: explain FileGuard usage and privacy"
```

---

### Task 10: Platform matrisi, paket doğrulama ve gerçek Claude Code kabul testi

**Files:**
- Create: `.github/workflows/test.yml`
- Create: `test/integration/fail-open.test.mjs`
- Create: `test/integration/full-flow.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Tam uçtan uca testi yaz**

Tek test şu zinciri gerçek hook giriş noktalarıyla çocuk süreçlerde çalıştırsın:

1. Session startup.
2. İlk PreRead izin.
3. İlk PostRead kayıt.
4. Aynı PreRead engel ve doğru JSON.
5. Rapor: `1` engel.
6. Override oluştur.
7. Aynı PreRead bir kez izin.
8. Sonraki tekrar yeniden engel.
9. Session compact.
10. Aynı dosya yeni bağlamda izin.

Test sonunda durum klasöründeki bütün JSON dosyalarını tara ve hiçbir dosyada fixture içeriğinin tam metninin bulunmadığını doğrula.

- [ ] **Step 2: Fail-open hata enjeksiyon testini tamamla**

Şunların her biri PreToolUse için exit `0` ve boş stdout üretmeli:

- Geçersiz JSON stdin.
- Eksik `session_id`.
- Eksik `file_path`.
- Klasör yolu.
- Snapshot sırasında silinen dosya.
- Store API'sinin izin hatası.
- Bozuk context/read JSON'u.

Yalnızca gerçekten bulunan, şeması geçerli read record + eşleşen digest engel üretebilir.

- [ ] **Step 3: GitHub Actions matrisini ekle**

`.github/workflows/test.yml` push ve pull request üzerinde şu matrisi kullansın:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [windows-latest, macos-latest, ubuntu-latest]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 20
  - run: npm test
```

Projede bağımlılık olmadığı için `npm install`, paket önbelleği, lockfile veya ek bağımlılık oluşturma.

- [ ] **Step 4: Yerel otomatik doğrulamayı çalıştır**

Run: `npm test`

Expected: bütün testler geçer, başarısız veya atlanan test yok.

Run: `claude plugin validate .`

Expected: marketplace geçerli.

Run: `claude plugin validate ./plugins/fileguard`

Expected: manifest, hooks ve iki skill geçerli.

Run: `git diff --check`

Expected: çıktı yok.

Run: `rg -n "TODO|TBD|FIXME|placeholder|GÖREVİ BURAYA YAZ" . --glob "!.git/**" --glob "!docs/superpowers/plans/**"`

Expected: çıktı yok.

- [ ] **Step 5: Windows gerçek oturum kabul testi için kullanıcı onayı al**

`C:\AI-Projects\AI-Shorts-Agent` üzerinde yazma yapmadan test edileceğini açıkla. Kullanıcı onayından sonra proje klasöründe şu geliştirme yüklemesiyle Claude Code'u başlat:

```powershell
claude --plugin-dir "C:\Users\tay_p\Documents\Codex\Pathfinder-FileGuard\plugins\fileguard"
```

Claude'dan küçük ve gizli bilgi içermeyen bir metin dosyasını aynı `offset`/`limit` ile iki kez `Read` aracından okumasını iste. Kabul ölçütleri:

- İlk okuma normal tamamlanır.
- İkinci okuma içerik gelmeden FileGuard mesajıyla engellenir.
- `/fileguard:report --hide-paths` bir engel ve ölçülebilen tasarrufu gösterir.
- `/fileguard:allow-next` sonrası aynı okuma bir kez geçer.
- Sonraki tekrar tekrar engellenir.
- `/compact` sonrası aynı okuma yeni bağlamda geçer.
- Claude Code'un normal çalışması ve proje dosyaları değişmez.

Kabul testinde bir platform/API uyumsuzluğu görülürse yeni özellik ekleme; önce failing regression testi yaz, en küçük düzeltmeyi yap ve bütün testleri yeniden çalıştır.

- [ ] **Step 6: README'deki doğrulanmış durum cümlesini güncelle**

Gerçek test geçmeden “Windows verified” yazma. Geçtikten sonra yalnızca gözlenen sonucu belirt; sentetik karakter tasarrufunu gerçek faturalı token tasarrufu gibi sunma.

- [ ] **Step 7: Son commit**

```bash
git add .github/workflows/test.yml test/integration README.md
git commit -m "test: verify FileGuard release candidate"
```

---

## Plan Sonu Özdenetim

- [ ] Tasarımdaki her dahil özellik en az bir görev ve testle eşleşiyor.
- [ ] Tasarım dışı `Glob`, `Grep`, dış servis veya ürün yol haritası kodu yok.
- [ ] İlk okuma yalnızca başarılı PostToolUse sonrası koruma kaydı oluşturuyor.
- [ ] Aynı session + agent + context + normalized path + range + digest koşullarının tamamı test ediliyor.
- [ ] Compact ve clear yeni bağlam oluşturuyor; resume oluşturmuyor.
- [ ] Override tam bir okumada tüketiliyor ve beş dakikada sona eriyor.
- [ ] State/diagnostic dosyalarında içerik ve sır yok.
- [ ] Fail-open sınırları hata enjeksiyonuyla doğrulanıyor.
- [ ] Rapor ölçülen karakter ve yaklaşık tokenı ayırıyor; para iddiası yok.
- [ ] README İngilizce, kullanıcı rehberi Türkçe ve iki CTA onaylanan metinlerle aynı.
- [ ] GitHub Actions üç işletim sisteminde aynı testleri çalıştırıyor.
- [ ] `claude plugin validate`, `npm test`, `git diff --check` ve yer tutucu taraması temiz.

## Resmî Teknik Dayanaklar

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
