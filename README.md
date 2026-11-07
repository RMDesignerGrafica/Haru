# Haru IA

Haru é um chat estático para navegador, celular e computador. A versão web não executa Python nem envia mensagens ou arquivos a um backend.

## Publicar no GitHub Pages

1. No GitHub, abra **Settings → Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions** como origem.
3. Envie as alterações para a branch `main`, ou execute manualmente o workflow **Publicar Haru no GitHub Pages** na aba **Actions**.
4. Quando a publicação terminar, abra `https://rmdesignergrafica.github.io/Haru/`.

O workflow publica somente os arquivos estáticos da pasta `Interface`.

## Criptografar mensagens

- Use **Criptografar texto** ou **Descriptografar texto**; o Haru pedirá a mensagem ou o código no chat.
- Ao criptografar uma mensagem, crie uma senha com pelo menos 8 caracteres.
- Envie o código `HARU2` gerado e compartilhe a senha por um canal separado. A outra pessoa abre o mesmo site, cola o código e informa essa senha.
- O botão **Copiar código** copia somente o código criptografado.

## Criptografar imagens e PDFs

- Clique em **Criptografar imagem/PDF** e selecione uma imagem ou PDF de até 50 MB.
- Crie uma senha com pelo menos 8 caracteres. O Haru baixa um arquivo `.haru` protegido.
- Envie o arquivo `.haru` e compartilhe a senha por um canal separado.
- Para abrir, clique em **Abrir arquivo protegido**, selecione o `.haru` e digite a senha. O Haru baixa o arquivo original com o nome e formato preservados.

Arquivos e mensagens são criptografados e descriptografados localmente no navegador usando a API Web Crypto (AES-GCM de 256 bits e PBKDF2/SHA-256). O site não recebe nem armazena o conteúdo. Use o endereço HTTPS do GitHub Pages; a API de criptografia requer um contexto seguro.

Mantenha uma cópia segura do arquivo `.haru` e não perca a senha: sem ela, o conteúdo não pode ser recuperado. Códigos `HARU3` da versão anterior continuam aceitos com a senha individual ou mestre usada ao criá-los. Códigos `HARU1` da versão Python para desktop não são compatíveis.
