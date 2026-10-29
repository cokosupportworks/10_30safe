# まなびのひろば

３つの既存Webアプリを切り替えるポータルです。配信用ファイルは `dist/` にあります。

- `index.html` / `portal.css` / `portal.js`：ポータル
- `hiragana_app/`：ひらがな50おん
- `monjibotaru/`：もんじぼたる
- `scratch/`：Scratchプレイヤー

既存アプリは https://github.com/cokosupportworks/10_30 のコミット 7abd78043085dcb59daadb505d4e293673e04e41 を基にしています。もんじぼたるには、起動時のフォント・保存領域の待機時間制限と起動失敗時のエラー表示を追加しています。

## 起動

```sh
python3 -m http.server 4173 --directory dist
```

http://localhost:4173 を開きます。録音は localhost または HTTPS で使用し、ブラウザのマイク許可が必要です。

## GitHubへの追加

元のリポジトリのルートに `dist/index.html`、`dist/portal.css`、`dist/portal.js` を追加すると、既存の３フォルダをそのまま利用できます。GitHub Pagesなどの静的ホスティングに対応します。GitHubへの変更は未送信です。

## 動作と留意点

- ホーム画面または上部メニューでアプリを切り替えます。
- `#hiragana`、`#monji`、`#scratch` のURLから直接起動できます。
- 切り替え時は前のiframeを破棄します。未保存の作業は失われるため、切り替え前に保存してください。
- 保存済みデータは各アプリの保存方式に従います。ブラウザ・配信元が変わると以前のデータは自動移行されません。
- 全画面表示が利用できない端末では「別タブ」を使えます。
- 元アプリのTailwind CDN・Google Fonts・辞書CDN・Scratchなどの外部通信は引き続き必要です。

録音・音声出力・実際のScratch作品の操作は、利用端末で確認してください。
