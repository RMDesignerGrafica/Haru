# Haru IA

Haru é um chat estático que pode ser aberto no celular ou computador pelo navegador. A versão web não executa Python nem envia mensagens a um backend.

## Publicar no GitHub Pages

1. No GitHub, abra **Settings → Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions** como origem.
3. Envie as alterações para a branch `main`, ou execute manualmente o workflow **Publicar Haru no GitHub Pages** na aba **Actions**.
4. Quando a publicação terminar, abra `https://rmdesignergrafica.github.io/Haru/`.

O workflow publica somente os arquivos estáticos da pasta `Interface`.

## Usar a criptografia

- Use os botões **Criptografar texto** e **Descriptografar texto** para iniciar uma operação; o Haru pedirá a mensagem ou o código no chat.
- Ao criptografar, informe uma senha individual e depois a senha mestre. O código `HARU3` pode ser aberto com qualquer uma delas.
- Ao criptografar uma nova mensagem, crie uma senha com pelo menos 8 caracteres.
- Envie o código `HARU2` gerado e compartilhe a senha por um canal separado. A outra pessoa abre o mesmo site, cola o código e informa essa senha.
- O botão **Copiar código** copia somente o código criptografado.

A criptografia usa a API Web Crypto do navegador: AES-GCM de 256 bits, com uma chave derivada da senha por PBKDF2/SHA-256 e sal e vetor de inicialização aleatórios. A mensagem e a senha não são enviadas ao GitHub Pages. Use o endereço HTTPS do site; o navegador precisa de um contexto seguro para criptografar.

Códigos `HARU3` enviados pela versão anterior continuam aceitos; eles podem ser abertos com a senha individual ou com a senha mestre usada na época. Códigos `HARU1` criados pela versão Python para desktop não são compatíveis.
