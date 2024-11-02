# ベースイメージとしてNode.jsの公式イメージを使用
FROM node:18

# 作業ディレクトリを設定
WORKDIR /usr/src/app

# パッケージファイルをコピーして依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリケーションファイルをコピー
COPY . .

# アプリケーションのポートを指定
EXPOSE 8080

# シェルを起動して、手動で node index.js を実行できるように設定
CMD ["/bin/sh"]
