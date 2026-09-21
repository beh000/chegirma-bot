# Официальный образ Microsoft Playwright: все системные библиотеки,
# нужные headless-браузеру для запуска на Linux, уже установлены и
# протестированы — надёжнее, чем вручную угадывать список apt-пакетов под
# билдер Railway. Сам браузер бота работает через Patchright (форк
# Playwright, лучше маскируется от антибот-защиты вроде Cloudflare), но ему
# нужны те же системные зависимости — этот образ их даёт бесплатно, свой
# браузер Patchright поставит себе сам через postinstall.
# Версия тега образа должна совпадать с версией пакета "patchright" в
# package.json (обе следуют номерам версий playwright).
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]
