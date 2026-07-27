# trancar-chaves

Regras permanentes para chaves de API:

1. **NUNCA** deixe chave/token/senha em texto puro no codigo
2. Toda chave vai no `.env` como `NOME=valor`
3. O codigo referencia `process.env.NOME`
4. `.env.example` tem os nomes mas com valor vazio
5. `.env` esta sempre no `.gitignore`
6. Se uma chave ja foi commitada, ROTACIONE (regenere) na fonte — adicionar ao .env agora nao desfaz o vazamento
7. Verifique o historico do git periodicamente atras de secrets

Checklist ao conectar nova ferramenta:
- [ ] Chave no .env
- [ ] Referencia no codigo via process.env
- [ ] .gitignore inclui .env
- [ ] .env.example atualizado
- [ ] Historico do git verificado
