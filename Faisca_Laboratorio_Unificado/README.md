# Faísca — Laboratório Criativo Unificado

Esta é a versão **unificada**: reúne as ferramentas do Faísca/Laboratório Criativo e do CamLab em uma única aplicação Flask, com uma única página e navegação compartilhada.

## Tudo que está incluído

- **Desenho livre:** cores, tamanhos, pincel normal, brilho mágico, pontilhado e arco-íris; desfazer e limpar.
- **Estúdio de fotos (CamLab integrado):** carregar imagens, filtros Original/Preto e branco/Quente/Azul/Vibrante/Sonho suave, ajustes de brilho, contraste e saturação.
- **Câmera:** ativar e desligar a câmera e congelar uma captura para editar no estúdio de fotos.
- **Experimentos interativos:** chuva de estrelas, bolhas e órbitas que reagem ao mouse ou toque.
- **Mãos mágicas:** rastreamento de até duas mãos, rastros neon, faíscas e arco-íris.
- **Efeitos no rosto:** coroa, óculos neon, constelação e antenas alienígenas.
- **Salvar criação:** exporta o quadro com a foto e os desenhos como PNG.
- **Interface unificada:** tudo fica na mesma aplicação, sem abrir dois projetos separados.

## Requisitos

- Python 3.10 ou mais recente
- Navegador moderno
- Internet para carregar os modelos de mãos/rosto na primeira utilização
- Câmera para as ferramentas de câmera, mãos e rosto

## Como executar

1. Extraia o ZIP.
2. Abra um terminal dentro da pasta `Faisca_Laboratorio_Unificado`.
3. Instale a dependência:

   ```bash
   python -m pip install -r requirements.txt
   ```

4. Inicie o servidor:

   ```bash
   python app.py
   ```

5. Abra `http://127.0.0.1:5000` no navegador.

## Câmera e privacidade

O navegador pedirá permissão para usar a câmera. O acesso à câmera funciona em `localhost` ou HTTPS. A detecção de mãos e rosto usa modelos carregados pela internet e é processada no navegador pelo código desta aplicação. As fotos carregadas e capturas são manipuladas no navegador; o projeto não contém uma rota que envie essas imagens a um serviço remoto.

Se os efeitos de mãos/rosto não carregarem, verifique a conexão com a internet, as permissões da câmera e tente atualizar o navegador.

## Estrutura

```text
Faisca_Laboratorio_Unificado/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```
