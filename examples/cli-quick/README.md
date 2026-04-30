# Быстрая проверка через CLI

```bash
npm i -g @yuppay/sdk

# Курс DarAi → USD (без API-ключа)
yuppay price --token darai

# Форматирование сумм
yuppay format 1234567890000000000000 --token darai
# → 1 234,57 Darai

# Создание счёта (нужен YUPPAY_API_KEY)
export YUPPAY_API_KEY=ypp_live_xxx
yuppay create-invoice --usd 9.99 --token darai --return-url https://shop.example/order/42

# Проверка статуса
yuppay get-invoice <publicToken>
```
