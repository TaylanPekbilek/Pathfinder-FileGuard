# Pathfinder FileGuard Tasarımı

**Tarih:** 15 Eylül 2026  
**Durum:** Onaylanmış tasarım  
**Ürün:** Pathfinder FileGuard  
**Proje konumu:** `C:\Users\tay_p\Documents\Codex\Pathfinder-FileGuard`

## 1. Amaç

Pathfinder FileGuard; Claude Code'un, değişmemiş bir dosyayı veya aynı dosya aralığını aynı aktif ajan bağlamına tekrar okumasını önleyen küçük, ücretsiz ve açık kaynaklı bir eklentidir. Amacı, tekrarlanan `Read` işlemi çalışmadan önce gereksiz bağlam büyümesini ve token tüketimini durdurmaktır.

FileGuard'ın kapsamı dar, davranışı şeffaf, çalışması yerel ve kaldırılması kolay olacaktır. Bu depo yalnızca aynı aktif bağlamda değişmemiş dosyaların tekrar okunmasını engelleyen FileGuard ürününü kapsar.

## 2. Ürünün Konumlandırılması

FileGuard tamamen yeni bir ürün kategorisiymiş gibi tanıtılmayacaktır. Tekrarlanan dosya okumalarını algılayan veya engelleyen açık kaynaklı araçlar zaten vardır. FileGuard'ın farkı; özellikle dar kapsamı, ihtiyatlı karar sistemi, her engelin nedenini göstermesi, telemetri kullanmaması, dış API çağrısı yapmaması ve tasarrufu yeniden üretilebilir ölçümlerle göstermesidir.

Kullanıcıya verdiğimiz söz:

> Claude Code'un, aynı aktif bağlamda bulunan değişmemiş dosyayı açık bir geçiş izni olmadan yeniden yüklemesini durdur.

FileGuard ücretsiz olacaktır. Amacı güven oluşturmak, ölçülebilir token tasarrufu göstermek ve gerçek kullanıcı geri bildirimleriyle gelişmektir.

## 3. Hedef Kullanıcı ve Platform

İlk sürüm; Windows, macOS ve Linux üzerinde yazılım projeleriyle çalışan Claude Code kullanıcılarını hedefler. İlk gerçek test ortamımız Windows olduğu için önce Windows sürümü doğrulanacaktır.

Eklenti kullanıcı seviyesinde kurulacak ve böylece birden fazla projeyi koruyabilecektir. Çalışma verilerinin tamamı kullanıcının bilgisayarında kalacaktır.

## 4. Kapsam

### 4.1 Dahil Olanlar

- Claude Code'un `Read` çağrılarını hook sistemi üzerinden izlemek.
- Başarılı okumaları oturum, ajan, mutlak dosya yolu, istenen satır aralığı ve bağlam nesliyle kaydetmek.
- Aynı aktif ajan bağlamındaki değişmemiş içeriğin birebir tekrar okumasını algılamak.
- Gereksiz okumayı, dosya içeriği model bağlamına girmeden önce engellemek.
- Okumanın neden engellendiğini açıklamak.
- Tek okumalık açık geçiş izni sunmak.
- Bağlam sıkıştırıldıktan sonra bağlama bağlı koruma kayıtlarını sıfırlamak.
- Ana ajan ile alt ajanların geçmişini birbirinden ayırmak.
- Engellenen okuma, önlenen karakter ve yaklaşık token miktarını raporlamak.
- Yalnızca Node.js'in yerleşik özellikleriyle, dış yapay zekâ veya uygulama API'si olmadan yerel çalışmak.

### 4.2 Dahil Olmayanlar

- Klasör, depo, `Glob` veya `Grep` taramalarını tekrar yönünden denetlemek.
- Komut ve test çıktılarını küçültmek.
- Tekrarlanan hataları veya alternatif çözüm stratejilerini algılamak.
- Google Console ve OAuth dahil dış servis durumlarını takip etmek.
- Codex, Gemini CLI, Cursor veya başka ajanlarla bütünleşmek.
- Bulut depolama, eşitleme, kullanıcı hesabı, telemetri veya analiz yükleme.
- Yerel ya da uzaktaki dil modelleri ve gömme modelleri.
- Görsel yönetim paneli.
- Ödeme, lisans, abonelik veya ücretli özellikler.
- Büyük belgelerde iddia doğrulama ve halüsinasyon tespiti.

## 5. Teknik Yaklaşım

FileGuard, küçük Node.js hook programları ve eklenti komutlarından oluşan bir Claude Code eklentisidir. Çalışma zamanında üçüncü taraf bağımlılık kullanmaz.

### 5.1 Bileşenler

1. **Okuma öncesi koruma:** `Read` aracı için `PreToolUse` aşamasında çalışır. İsteği standartlaştırır, geçmişi ve dosya durumunu kontrol eder, işleme izin verir veya engeller.
2. **Başarılı okuma kaydedicisi:** Başarılı bir `Read` sonrasında çalışır ve yalnızca gerçekten modele ulaştırılan okumaları kaydeder.
3. **Bağlam yaşam döngüsü yöneticisi:** Oturum başlangıcını ve bağlam sıkıştırma olaylarını takip eder. Her sıkıştırma, aynı Claude oturumu içinde yeni bir bağlam nesli başlatır.
4. **Yerel durum deposu:** Oturum ve ajan bazındaki okuma kayıtlarını, ayrıca yalnızca ekleme yapılan tasarruf günlüğünü Claude eklenti veri klasöründe tutar.
5. **Geçiş komutu:** Bir sonraki eşleşen okuma için tek kullanımlık ve dar kapsamlı izin oluşturur.
6. **Rapor komutu:** Dış servise bağlanmadan engellenen okumaları ve yaklaşık tasarrufu özetler.

### 5.2 Okuma Kimliği

Her okuma kimliği şunlardan oluşur:

- Claude oturum kimliği
- Ana ajanı da açıkça temsil eden ajan kimliği
- Standartlaştırılmış mutlak dosya yolu
- İstenen başlangıç noktası
- İstenen okuma sınırı
- Bağlam nesli numarası

Windows yolları büyük-küçük harfe duyarsız ve aynı ayraç biçiminde değerlendirilir. macOS ile Linux'ta işletim sisteminin harf duyarlılığı korunur. Aynı dosyanın göreli veya `~` kullanılan yazımları ayrı kimlik sayılmaz; Claude Code, dosya hook'larına mutlak yol sağlar.

### 5.3 İçerik Durumu

Başarılı bir okumadan sonra şunlar kaydedilir:

- Dosya boyutu
- İşletim sistemi destekliyorsa yüksek çözünürlüklü değiştirilme zamanı
- İlgili dosya durumunun SHA-256 özeti
- Ulaştırılan karakter sayısı veya kesin sayı yoksa ihtiyatlı tahmin
- Başarılı okumanın zamanı

Olası tekrarda önce hızlı dosya bilgileri kontrol edilir. Bunlar aynı durumu gösteriyorsa engellemeden önce içerik özeti doğrulanır. Dosya güvenilir biçimde incelenemezse okumaya izin verilir.

### 5.4 Tekrarlanan Okumanın Tanımı

Bir okuma yalnızca aşağıdaki koşulların tamamı sağlanırsa engellenir:

- Önceki okuma başarıyla tamamlanmıştır.
- Oturum kimliği aynıdır.
- Ajan kimliği aynıdır.
- Bağlam nesli aynıdır.
- Standartlaştırılmış mutlak dosya yolu aynıdır.
- Tam dosya okumaları dahil istenen aralık aynıdır.
- Dosyanın güncel özeti, önceki başarılı okumadan sonra kaydedilen özetle aynıdır.
- Bu okuma için geçerli bir tek kullanımlık izin bulunmamaktadır.

Koşullardan biri sağlanmıyor veya kesin biçimde doğrulanamıyorsa okumaya izin verilir.

### 5.5 Karar Akışı

1. Claude Code bir `Read` çağrısı önerir.
2. Okuma öncesi koruma isteği standartlaştırır.
3. Eşleşen başarılı okuma yoksa işleme izin verir.
4. Eşleşme varsa güncel dosya bilgilerini ve içerik özetini kontrol eder.
5. İçerik veya istenen aralık değişmişse okumaya izin verir.
6. Aynı aktif bağlamda olduğu kanıtlanan tekrar varsa işlem başlamadan engeller.
7. Engel mesajı önceki okumayı belirtir; farklı aralık istemeyi veya tek kullanımlık izni açıklar.
8. İzin verilen başarılı okumalar yerel durumu ve günlüğü günceller.

## 6. Tek Kullanımlık Geçiş

`/fileguard:allow-next` komutu tek kullanımlık izin oluşturur. Bu izin, mevcut oturum ve ajanda aksi halde engellenecek bir sonraki `Read` çağrısıyla sınırlıdır. Beş dakika sonra kendiliğinden geçersiz olur ve kullanıldığı anda silinir.

Bu izin FileGuard'ı kalıcı olarak kapatmaz. Eklenti bütünüyle Claude Code'un normal eklenti kontrollerinden devre dışı bırakılabilir; FileGuard ayrıca kalıcı bir geçiş mekanizması oluşturmaz.

## 7. Bağlam ve Ajan Ayrımı

FileGuard her ajan bağlamını ayrı değerlendirir. Ana ajanın okuduğu dosya bir alt ajanın ilk okumasını, bir alt ajanın okuması da diğer alt ajanın ilk okumasını engellemez.

Claude Code elle veya otomatik bağlam sıkıştırmasını tamamladığında bağlam nesli artırılır. Önceki neslin okumaları tasarruf günlüğünde kalır fakat yeni bağlamdaki okumaları engelleyemez.

Yeni Claude oturumu boş bir aktif okuma kümesiyle başlar. FileGuard, önceki oturumdaki içeriğin model tarafından hâlâ bilindiğini varsaymaz.

## 8. Güvenlik ve Hata Yönetimi

FileGuard, hata hâlinde çalışmaya izin verme ilkesini uygular. Durum kaydı eksik, bozuk, kilitli, uyumsuz veya erişilemezse; dosya özeti çıkarılamazsa; yol standartlaştırılamazsa ya da hook zaman aşımına uğrarsa okuma engellenmez ve kısa tanı bilgisi yalnızca yerel günlüğe yazılır.

Eklenti proje dosyalarını değiştirmez, silmez veya yeniden yazmaz. Yalnızca içerik özeti çıkarabilmek için dosya bilgilerini ve içeriğini okur. Çalışma kayıtlarında yollar, aralıklar, boyutlar, özetler, zamanlar ve sayılar bulunur; dosya içerikleri, istemler, API anahtarları, ortam değişkenleri veya model yanıtları bulunmaz.

Durum kayıtları gerektiğinde atomik değiştirme veya yalnızca ekleme yöntemiyle yazılır. Eş zamanlı ajanlar ortak durumu bozamaz. Eski oturum verileri, proje dosyalarına dokunmadan belgelenmiş saklama sınırına göre temizlenir.

## 9. Kullanıcıya Gösterilecek Bilgi

Engellenen okumada aşağıdakine benzer kısa bir mesaj gösterilir:

> FileGuard, `src/example.ts` dosyasının 1-240. satırlarının değişmemiş tekrar okumasını engelledi. Aynı aralık bu aktif ajan bağlamında daha önce başarıyla okundu ve dosya özeti değişmedi. Farklı bir aralık isteyin veya tek kullanımlık geçiş için `/fileguard:allow-next` komutunu çalıştırın.

Mesajlar faturalandırılmış token tasarrufunun kesin olduğunu iddia etmez. Önlenen karakter sayısı ile açıkça yaklaşık olduğu belirtilen token tahmini gösterilebilir.

## 10. Tasarruf Raporu

`/fileguard:report` komutu şunları gösterir:

- Mevcut oturumda engellenen okuma sayısı
- Saklanan yerel geçmişteki toplam engellenen okuma sayısı
- Önlenen karakter sayısı
- Belgelenmiş yönteme göre yaklaşık token tasarrufu
- Engellenen en büyük tekil tekrar okuması
- Paylaşılan ekran görüntülerinde yolları gizleme seçeneğiyle ilgili dosya yolları

Rapor, ölçülen karakter ile tahmin edilen token sayısını açıkça ayırır. İleride kullanıcı ayrıca fiyat bilgisi vermediği sürece para tasarrufu hesaplanmaz.

## 11. Test Stratejisi

Otomatik testler, gerçekçi yapay Claude Code hook verileriyle hook programlarını çalıştırır. En az şu durumlar test edilir:

- İlk okumaya izin verilir.
- Aynı bağlamdaki değişmemiş birebir tekrar engellenir.
- Yol ve aralık aynı olsa bile içerik değişmişse okumaya izin verilir.
- Daha önce ulaştırılmamış farklı başlangıç veya sınır değerine izin verilir.
- Başarısız bir okuma engelleme kaydı oluşturmaz.
- Ana ajan ile alt ajanların kayıtları ayrıdır.
- Farklı alt ajanlar birbirinden ayrıdır.
- Yeni oturum eski kayıtlardan etkilenmez.
- Bağlam sıkıştırıldıktan sonra yeni okumaya izin verilir.
- Windows yolundaki harf ve ayraç farklılıkları tutarlı biçimde aynı dosyayı gösterir.
- macOS ve Linux yol davranışları korunur.
- Geçerli tek kullanımlık izin bir okumaya izin verir ve ardından tüketilir.
- Süresi dolan izin yok sayılır.
- Bozuk veya kilitli durumda okuma engellenmez.
- Eksik ya da silinmiş dosyalarda Claude Code'un normal davranışına müdahale edilmez.
- Tasarruf toplamları kaydedilen engellemelerle eşleşir.

Kullanıcının ayrıca onay vermesi şartıyla eklenti, `C:\AI-Projects\AI-Shorts-Agent` üzerinde gerçek Claude Code oturumunda sınanır. Gerçek kabul testi en az bir gereksiz tekrarı doğru engellemeli ve gerekli bir okumayı durdurmamalıdır.

## 12. Başarı Ölçütleri

İlk herkese açık sürüm aşağıdaki koşullarda kabul edilebilir:

- Otomatik testlerde kanıtlanmış bütün tekrarlar içerik bağlama girmeden engellenir.
- İzin verilmesi gereken testlerin hiçbirinde gerekli okuma engellenmez.
- Hook hatası Claude Code'un normal çalışmasını durdurmaz.
- Rapor ölçülen karakter ile tahmin edilen token sayısını doğru ayırır.
- FileGuard çalışma verilerinde proje dosyası içeriği veya gizli bilgi saklanmaz.
- Windows'ta kurulum, geçiş, rapor, devre dışı bırakma ve kaldırma adımları tekrar uygulanabilir biçimde belgelenir.
- Temel otomatik testler Windows, macOS ve Linux'ta geçer.

## 13. Dağıtım

FileGuard, MIT lisanslı GitHub deposu ve Claude Code eklentisi olarak yayımlanır. Depoda eklenti bildirimi, hook'lar, komutlar, otomatik testler, kısa README, gizlilik açıklaması, sınırlamalar ve kaldırma talimatları bulunur.

İlk dağıtım GitHub üzerinde barındırılan Claude eklenti mağazasıyla yapılır. Anthropic'in herkese açık eklenti dizinine ancak gerçek kullanım kabul testi ve platformlar arası testler geçtikten sonra başvurulur.

FileGuard telemetri kullanmaz. Herkese açık tasarruf iddiaları yeniden çalıştırılabilir testlerle desteklenir; yapay test ölçümleri ile gerçek oturum gözlemleri birbirinden ayrılır.

## 14. Teslimat Tahmini

Odaklı çalışma ve yeterli Codex kotasıyla:

- Test altyapısı ve ilk engelleme prototipi: bir gün
- Güvenli oturum, ajan, aralık, özet, sıkıştırma ve geçiş davranışları: iki-üç ek gün
- Raporlama, belgeler, paketleme ve platformlar arası doğrulama: iki-dört ek gün

Hedef, üç-beş yoğun çalışma gününde test edilebilir MVP ve yaklaşık bir-iki haftada herkese açık beta çıkarmaktır. Bunlar garanti değil tahmindir; Claude Code hook davranışları ve farklı platformlardaki bulgular takvimi değiştirebilir.

## 15. FileGuard'a Destek Olun

FileGuard size zaman veya token kazandırdıysa GitHub deposuna yıldız vererek ve Claude Code kullanan dostlarınızla paylaşarak destek olabilirsiniz. Deneyimleriniz ve geri bildirimleriniz, gelecekte geliştireceğimiz yararlı araçlara yön verecektir.
