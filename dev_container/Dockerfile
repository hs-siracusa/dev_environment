# AlmaLinux 9.4 ベースイメージを使用
FROM almalinux:9.4

# 必要なパッケージのインストール
RUN dnf clean all && \
    dnf -y update && \
    dnf -y install \
        epel-release \
        python3 \
        python3-pip \
        git \
        vim-enhanced \
        wget \
        gcc \
        make \
        zip \
        unzip \
        openssl-devel \
        libffi-devel \
        bzip2-devel \
        --allowerasing && \
    dnf clean all

# 仮想環境を /venv に作成
RUN python3 -m venv /venv

# 仮想環境を PATH に追加
ENV PATH="/venv/bin:$PATH"

# 作業ディレクトリを /app に設定
WORKDIR /app

# /mount はホストからマウントされる予定のディレクトリ
RUN mkdir -p /mount

# bash シェルを使うための設定
ENTRYPOINT ["/bin/bash"]
