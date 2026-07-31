import { escapeHtml } from "../utils/html";

export interface LoginPageParams {
  erro: string | null;
  /** Quando ainda não existe nenhum usuário, explica como criar o primeiro em vez de deixar a pessoa travada. */
  primeiroAcesso: boolean;
}

export function renderizarLoginHtml({ erro, primeiroAcesso }: LoginPageParams): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Entrar — Casa da Árvore</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f4f6f4;
           margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .caixa { background: #fff; border: 1px solid #e0e4e0; border-radius: 10px; padding: 28px; width: 100%;
             max-width: 380px; }
    h1 { color: #2f5233; font-size: 20px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 13px; margin: 0 0 20px; }
    label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
    input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 15px;
            font-family: inherit; margin-bottom: 14px; }
    button { width: 100%; padding: 11px; border: 0; border-radius: 6px; background: #2f5233; color: #fff;
             font-size: 15px; cursor: pointer; font-family: inherit; }
    button:hover { background: #3d6b42; }
    .erro { background: #fdecea; color: #b00020; padding: 10px; border-radius: 6px; font-size: 13px;
            margin-bottom: 16px; }
    .dica { background: #fff8e1; color: #8a6d00; padding: 10px; border-radius: 6px; font-size: 13px;
            margin-bottom: 16px; line-height: 1.45; }
    code { background: #eee; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <form class="caixa" method="post" action="/login">
    <h1>Casa da Árvore</h1>
    <p class="sub">Entre com sua conta para acessar o painel.</p>

    ${erro ? `<div class="erro">${escapeHtml(erro)}</div>` : ""}
    ${
      primeiroAcesso
        ? `<div class="dica"><b>Nenhum usuário cadastrado ainda.</b><br>
           Crie o primeiro com <code>npm run criar-usuario</code>.<br>
           Enquanto não existir usuário, a credencial compartilhada antiga continua valendo.</div>`
        : ""
    }

    <label for="email">E-mail</label>
    <input id="email" name="email" type="email" autocomplete="username" required autofocus>

    <label for="senha">Senha</label>
    <input id="senha" name="senha" type="password" autocomplete="current-password" required>

    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;
}
