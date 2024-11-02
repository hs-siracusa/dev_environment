const express = require('express');
const axios = require('axios');
const {
  NOTION_API_KEY,
  MINUTES_DATABASE_ID,
  MANUAL_DATABASE_ID,
  WORKSPACE_DOMAIN,
} = require('./config');

const app = express();
const port = process.env.PORT || 8080;

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

// ログ出力用の関数
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// ページのタイトルとURLを取得
async function getPageDetails(pageId) {
  try {
    const response = await axios.get(
      `https://api.notion.com/v1/pages/${pageId}`,
      { headers }
    );
    const properties = response.data.properties;
    const rawUrl = response.data.url;

    // Notionドメインをワークスペースドメインに置き換えたURLを生成
    const shareUrl = rawUrl.replace('https://www.notion.so', `https://${WORKSPACE_DOMAIN}.notion.site`);

    // ページのタイトルプロパティを探す
    let title = 'Untitled';
    for (const key in properties) {
      if (properties[key].type === 'title') {
        const titleProperty = properties[key].title;
        if (titleProperty.length > 0) {
          title = titleProperty.map((part) => part.plain_text).join('');
        }
      }
    }
    return { title, shareUrl };
  } catch (error) {
    log(
      `ページの詳細取得中にエラーが発生しました（ページID: ${pageId}）：${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    throw error;
  }
}

// 共有状況を更新し、「共有する」チェックボックスをオフにする関数
async function updateShareStatusAndUncheck(pageId, status) {
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        properties: {
          '共有状況': {
            select: {
              name: status,
            },
          },
          '共有する': {
            checkbox: false,
          },
        },
      },
      { headers }
    );
    log(`「共有状況」を「${status}」、共有するチェックボックスをオフにしました（ページID: ${pageId}）`);
  } catch (error) {
    log(
      `共有状況更新中にエラーが発生しました（ページID: ${pageId}）：${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
  }
}

// トグルブロック（「議事録一覧」または「マニュアル一覧」）を検索してIDを返す関数
async function findToggleBlock(pageId, searchText) {
  try {
    const response = await axios.get(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      { headers }
    );

    for (const block of response.data.results) {
      if (
        block.type === 'heading_2' &&
        block[block.type].is_toggleable &&
        block[block.type].rich_text.some(
          (text) => text.plain_text === searchText
        )
      ) {
        return block.id;
      }
    }
  } catch (error) {
    log(
      `トグルブロック検索中にエラーが発生しました（ページID: ${pageId}）：${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
  }
  return null;
}

// ページの処理
async function processPage(page, pageType) {
  const pageId = page.id.replace(/-/g, ''); // ページID（ハイフンなし）
  log(`ページを処理します（ページID: ${pageId}）`);

  try {
    // ページの詳細を取得（タイトルと共有URL）
    const { title, shareUrl } = await getPageDetails(page.id);

    // 関連するプロジェクトページを取得
    const relationProperty = page.properties['プロジェクト'];
    if (!relationProperty || relationProperty.type !== 'relation') {
      throw new Error('プロジェクトのリレーションプロパティが見つかりません');
    }

    const projectIds = relationProperty.relation.map((rel) => rel.id);

    for (const projectId of projectIds) {
      // トグルブロックを検索
      const searchText = pageType === 'minutes' ? '議事録一覧' : 'マニュアル一覧';
      const targetToggleId = await findToggleBlock(projectId, searchText);

      if (!targetToggleId) {
        log(
          `プロジェクトページ（ID: ${projectId}）で「${searchText}」を含むトグルブロックが見つかりませんでした`
        );
        await updateShareStatusAndUncheck(page.id, '共有失敗');
        return;
      }

      // タイトルを表示するテキストブロックを作成（リンク付き）
      const textBlock = {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: title,
                link: {
                  url: shareUrl,
                },
              },
            },
          ],
        },
      };

      // トグルブロックの子としてリンクを挿入
      await axios.patch(
        `https://api.notion.com/v1/blocks/${targetToggleId}/children`,
        {
          children: [textBlock],
        },
        { headers }
      );

      log(
        `共有URLをプロジェクトページ（ID: ${projectId}）の「${searchText}」トグル内に追加しました（ページID: ${page.id}）`
      );
    }

    // 共有状況を「共有済」に更新し、共有するチェックボックスをオフに設定
    await updateShareStatusAndUncheck(page.id, '共有済');
  } catch (error) {
    log(
      `ページ処理中にエラーが発生しました（ページID: ${page.id}）：${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    // 共有状況を「共有失敗」に更新
    await updateShareStatusAndUncheck(page.id, '共有失敗');
  }
}

// データベース内のページを処理
async function processDatabase(databaseId, pageType) {
  try {
    let cursor = undefined;
    const pages = [];

    do {
      const response = await axios.post(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          filter: {
            property: '共有状況',
            select: { equals: '未共有' },
          },
          page_size: 100,
          start_cursor: cursor,
        },
        { headers }
      );

      pages.push(...response.data.results);
      cursor = response.data.next_cursor;
    } while (cursor);

    log(`データベース（ID: ${databaseId}）の対象ページ数：${pages.length}件`);

    // 各ページを処理
    for (const page of pages) {
      await processPage(page, pageType);
    }
  } catch (error) {
    log(
      `データベース処理中にエラーが発生しました（データベースID: ${databaseId}）：${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
  }
}

// メイン処理
async function main() {
  log(`メイン処理を開始します`);

  // 議事録データベースを処理
  await processDatabase(MINUTES_DATABASE_ID, 'minutes');

  // 業務マニュアルデータベースを処理
  await processDatabase(MANUAL_DATABASE_ID, 'manual');

  log(`メイン処理が完了しました`);
}

// HTTPリクエストでmain関数を呼び出すエンドポイント
app.get('/', async (req, res) => {
  await main();
  res.send('Notion sync process completed');
});

// サーバーを起動
app.listen(port, () => {
  log(`App listening on port ${port}`);
});
