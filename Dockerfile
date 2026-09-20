# Официальный образ Microsoft Playwright: Chromium и все системные
# библиотеки, нужные ему для запуска, уже установлены и протестированы —
# надёжнее, чем вручную угадывать список apt-пакетов под билдер Railway.
# Версия тега должна совпадать с версией пакета "playwright" в package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]
