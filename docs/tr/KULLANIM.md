# Pathfinder FileGuard Kullanım Kılavuzu

**Değişmemiş aynı dosyanın aynı Claude Code bağlamına ikinci kez girmesini durdurur.**

FileGuard, bilgisayarınızda çalışan küçük bir Claude Code eklentisidir. Başarılı bir `Read` işleminden sonra dosya içeriğinin parmak izini ve okunan aralığı o bağlam için hatırlar. Claude aynı değişmemiş içeriği yeniden okumaya çalışırsa, dosya Claude'a dönmeden önce tekrarı engeller.

Başka bir yapay zekâ modeli çağırmaz, API veya sunucu kullanmaz, telemetri göndermez ve dosya içeriğini saklamaz.

## 20 saniyelik örnek

FileGuard olmadan:

```text
Claude src/app.ts dosyasını okur
Claude değişmemiş aynı dosyayı yeniden okur
Aynı içerik aktif bağlama ikinci kez girer
```

FileGuard ile:

```text
İlk okuma: izin verilir ve başarıdan sonra kaydedilir
İkinci aynı ve değişmemiş okuma: içerik dönmeden engellenir
Gerçekten gerekli mi? /fileguard:allow-next çalıştırılır ve bir kez yeniden denenir
```

FileGuard, kanıtlanmış tekrar içeriğinin aktif bağlama yeniden girmesini önler. Gerçek token ücretlendirmesi ve önbellek davranışı değişebileceği için kesin bir fatura tasarrufu vaat etmez.

## Neyi engeller, neye izin verir?

| Durum | Sonuç |
| --- | --- |
| Aynı dosya, aynı aralık, aynı içerik, aynı ajan ve bağlam | Engellenir |
| İlk okuma | İzin verilir |
| Dosya içeriği değişmiş | İzin verilir |
| `offset` veya `limit` farklı | İzin verilir |
| Yeni Claude Code oturumu | İzin verilir |
| Farklı alt ajan | İzin verilir |
| Sıkıştırma veya temizleme sonrası yeni bağlam | İzin verilir |
| Dosya ya da yerel kayıt güvenle doğrulanamıyor | İzin verilir (güvenli açık) |
| Tek-okuma izni verilmiş | Bir kez izin verilir |

FileGuard şu anda yalnızca Claude Code'un `Read` aracını izler. Kesin sınırlar için [Sınırlamalar](../../LIMITATIONS.md) belgesine bakın.

## Gereksinimler

- Claude Code 2.1.270 veya daha yeni
- Node.js 20 veya daha yeni

## Yerel olarak deneme

Depoyu bilgisayarınıza aldıktan sonra ana klasöründe terminal açın:

```sh
claude --plugin-dir ./plugins/fileguard
```

FileGuard yalnızca açılan Claude Code oturumunda etkin olur. Paket kurulumu, hesap, API anahtarı veya sunucu gerekmez.

## GitHub üzerinden kurulum

Depo yayımlandıktan sonra Claude Code içinde sırasıyla şunları çalıştırın:

```text
/plugin marketplace add TaylanPekbilek/Pathfinder-FileGuard
/plugin install fileguard@pathfinder-tools
```

Terminal karşılıkları:

```sh
claude plugin marketplace add TaylanPekbilek/Pathfinder-FileGuard
claude plugin install fileguard@pathfinder-tools
```

## Komutlar

### Bir sonraki tekrar okumaya izin ver

```text
/fileguard:allow-next
```

Normalde engellenecek bir sonraki okuma için tek kullanımlık izin verir. Yalnızca mevcut oturumda geçerlidir, beş dakika sonra sona erer ve uygun bir okumada tüketilir.

### Tasarruf raporunu göster

```text
/fileguard:report
```

Mevcut oturum ve saklanan 30 günlük geçmiş için engellenen okuma sayısını, ölçülebilen karakterleri, yaklaşık token karşılığını ve en büyük ölçülmüş tekrarı gösterir.

Paylaşacağınız raporda dosya yollarını gizlemek için:

```text
/fileguard:report --hide-paths
```

Yaklaşık token değeri `karakter / 4` hesabıdır. Yön gösteren kaba bir tahmindir; Claude'un ölçtüğü kullanım veya fatura verisi değildir.

## Gizlilik ve güvenlik

FileGuard tamamen yerel çalışır. Aynı okumayı kanıtlamak için gereken dosya yolu, okuma aralığı, dosya bilgileri ve SHA-256 parmak izi gibi verileri Claude Code'un eklenti veri klasöründe tutar. Kaynak kod içeriğini, istemleri veya model yanıtlarını saklamaz ve ağ isteği yapmaz.

Dosya yolları hassas bilgi içerebilir. Bir raporu paylaşırken `--hide-paths` seçeneğini kullanın. Ayrıntılar için [Gizlilik](../../PRIVACY.md) belgesini okuyun.

FileGuard emin olamazsa okumaya izin verir. Böylece gerçek çalışmayı yanlışlıkla durdurmaz; fakat belirsiz durumlarda bazı tekrarlar geçebilir.

## Devre dışı bırakma ve kaldırma

```sh
claude plugin disable fileguard@pathfinder-tools
claude plugin uninstall fileguard@pathfinder-tools
```

Eklenti son kapsamından kaldırıldığında Claude Code, eklenti verilerini varsayılan olarak siler. Verileri korumak isterseniz kaldırma komutuna `--keep-data` ekleyin.

Yalnızca eklenti mağazası kaydını kaldırmak için:

```sh
claude plugin marketplace remove pathfinder-tools
```

## Projeyi destekleyin

FileGuard size zaman veya token kazandırdıysa GitHub deposuna yıldız vererek ve Claude Code kullanan dostlarınızla paylaşarak destek olabilirsiniz. Deneyimleriniz ve geri bildirimleriniz, gelecekte geliştireceğimiz yararlı araçlara yön verecektir.
