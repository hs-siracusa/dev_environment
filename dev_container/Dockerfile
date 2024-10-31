# AlmaLinux 9.4 ベースイメージを使用
FROM almalinux:9.4

# 必要なパッケージのインストール（`curl` を除外）
RUN dnf clean all && \
    dnf -y update && \
    dnf -y install \
        epel-release \
        python3 \
        python3-pip \
        git \
        wget \
        gcc \
        make \
        zip \
        unzip \
        openssl-devel \
        libffi-devel \
        bzip2-devel \
        sudo \
        --allowerasing && \
    dnf clean all

# Node.js のインストール（NodeSource を使用）
RUN curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && \
    dnf install -y nodejs && \
    dnf clean all

# 作業ディレクトリを /app に設定
WORKDIR /app

# /mount はホストからマウントされる予定のディレクトリ
RUN mkdir -p /mount

# アプリケーションの依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリケーションコードをコピー
COPY . .

# bash シェルを使うための設定
ENTRYPOINT ["/bin/bash"]