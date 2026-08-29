# Binance Testnet/Live İzolasyon Rehberi (GÜNCELLENMIŞ v2.0)

## ⚠️ KRİTİK HATA DÜZELTMELER

Bu versionda **Binance Testnet WebSocket bağlantı hataları** tamamen giderilmiştir.

### Neler Düzeltildi?

#### 1. ✅ WebSocket Endpoint Hataları
- **BEFORE:** Testnet'de `wss://fstream.binancefuture.com` (canlı endpoint!) kullanıyordu
- **AFTER:** Şimdi `wss://fstream.testnet.binancefuture.com` (doğru testnet endpoint)
- **Etki:** Ticker, order book, trade verileri artık testnet'ten geliyor

#### 2. ✅ Environment Mismatch Detection
- WebSocket mesajları kaynak ortam kontrolü yapıyor
- Testnet seçiliyken canlı veriler reddediliyor
- Order book sync ortam mismatch'inde iptal ediliyor

#### 3. ✅ Position Tracking Validation
- Pozisyon senkronizasyonu ortam kontrolü yapıyor
- Canlı/testnet karışması engelleniyor

#### 4. ✅ Enhanced Logging
```
✓ Testnet Mode AKTIF - Sanal hesap ve demo verileri kullanılacak. GERÇEK PARA YOK!
⚠️ LIVE Mode AKTIF - GERÇEK PARA ile işlem yapılacak. Dikkatli olun!
🔗 Binance TESTNET/DEMO WebSocket endpoints kullanılıyor. URL: wss://fstream.testnet.binancefuture.com
```

---

## 📋 Testnet Kurulum Adımları

### 1. Config.json Ayarı
```json
{
  "exchange": {
    "environment": "testnet",
    "key": "YOUR_TESTNET_API_KEY",
    "secret": "YOUR_TESTNET_API_SECRET",
    "pair_whitelist": ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
  },
  "stake_amount": 10,
  "max_open_trades": 1,
  "leverage": 15
}
```

### 2. Testnet API Key Alma
1. https://testnet.binancefuture.com adresine git
2. "Account" → "API Management" seç
3. "Create API Key" (Demo Trading)'ye tıkla
4. API Key ve Secret'i kopyala
5. **config.json**'a yapıştır

### 3. Doğrulama
Uygulama başlatıldığında konsolda bu mesajları görmelisiniz:

✅ **Testnet Başarılı:**
```
[INFO] ✓ Testnet Mode AKTIF - Sanal hesap ve demo verileri kullanılacak. GERÇEK PARA YOK!
[INFO] 🔗 Binance TESTNET/DEMO WebSocket endpoints kullanılıyor. URL: wss://fstream.testnet.binancefuture.com
[INFO] Binance DEMO/Test ortamı etkin (demo-fapi.binance.com).
```

❌ **Hata Durumunda:**
- `ENVIRONMENT MISMATCH` mesajı gösteriliyor → Kapatın ve yeniden başlatın
- Canlı endpoint'ler gösteriliyor → config.json düzeltilmiş mi kontrol edin

---

## 🔄 Testnet → Live Geçişi

1. **Testnet** altında algoritmanızı test edin
2. Pozitif sonuç aldıktan sonra:
   ```json
   "environment": "live"  // testnet -> live değiştirilir
   ```
3. **CANLÜ API KEYLERİNİ** yapıştırın
4. Log'u izleyin:
   ```
   [WARN] ⚠️ LIVE Mode AKTIF - GERÇEK PARA ile işlem yapılacak. Dikkatli olun!
   ```

---

## 📊 Veri Kaynakları (Ortam Başına)

### Testnet
| Veri Türü | Endpoint |
|-----------|----------|
| REST API | https://demo-fapi.binance.com |
| WebSocket | wss://fstream.testnet.binancefuture.com |
| Bakiye | Demo account USDT |
| Pozisyonlar | Sanal pozisyonlar |

### Live (Canlı)
| Veri Türü | Endpoint |
|-----------|----------|
| REST API | https://fapi.binance.com |
| WebSocket | wss://fstream.binance.com |
| Bakiye | Gerçek account USDT |
| Pozisyonlar | Gerçek pozisyonlar |

---

## 🛡️ Güvenlik Kontrolleri

### Otomatik Validasyonlar:
1. ✅ WebSocket kaynağı ortam kontrolü
2. ✅ REST endpoint'i ortam kontrollü
3. ✅ Position tracking ortam validation
4. ✅ Order book environment marking
5. ✅ Mixed environment detection
6. ✅ Configuration mismatch alerting

### Manuel Kontroller:
- [ ] config.json'da doğru `environment` değeri
- [ ] Doğru ortama ait API anahtarları
- [ ] Server başlangıç log'unda ortam doğrulandı
- [ ] WebSocket bağlantısında endpoint URL'i düzeltme

---

## 🐛 Troubleshooting

### Sorun: Testnet seçili ama canlı veriler geliyor
**Çözüm (ÖNCEKİ):** WebSocket endpoint'i yanlış → DÜZELTILDI ✅
- Yeni versionda otomatik olarak testnet endpoint'lerini kullanır
- Eski cache'i temizleyin: browser F12 → Storage → Clear

### Sorun: Order book güncel değil
**Çözüm:** 
- WebSocket bağlantısını kontrol edin: `wss://fstream.testnet.binancefuture.com`
- REST sync'i çalışıyor mu: `https://demo-fapi.binance.com`
- Log'ta ortam mismatch'i var mı kontrol edin

### Sorun: Position tracking yanlış
**Çözüm:**
- API anahtarının doğru ortama ait olması gerekir
- Testnet key ile live ortamda açılmış pozisyon olmamısı gerekir
- Server yeniden başlatın

---

## 📝 Versiyon Geçmişi

### v2.0 (GÜNCELLENMIŞ)
- ✅ WebSocket endpoint'leri testnet'e uyarlandı
- ✅ Environment mismatch detection eklendi
- ✅ Enhanced logging eklendi
- ✅ Position tracking validation eklendi
- ✅ Order book sync environment guard'ı eklendi

### v1.0
- ❌ WebSocket testnet endpoint'eri yanlıştı
- ❌ Canlı/testnet veriler karışıyordu

---

## 🚀 Best Practices

1. **İlk Kontrol:** Testnet'te başlayın - canlı para yok
2. **Backtest:** Algoritmanızı tarihsel verilerle test edin
3. **Demo Run:** Testnet'te gerçek parametrelerle çalıştırın
4. **Monitor:** Log'u izleyin - ortam doğrulandı mı?
5. **Live Switch:** Sadece başarılı sonuçlar almışsa geçin

---

## 📞 Support

Eğer hala testnet/live karışması yaşıyorsanız:
1. Browser cache'i temizleyin (Ctrl+Shift+Delete)
2. Server'ı yeniden başlatın
3. config.json doğrulama yap
4. Log'u `/api/v1/logs` endpoint'inde kontrol et

---

**Son Güncelleme:** Ağustos 29, 2026  
**Durum:** ✅ TESTNET İZOLASYONU DÜZELTILDI
