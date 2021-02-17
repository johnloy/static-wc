const path = require('path')

function injectScripts({ options, scripts, htmlSourceMeta, dom }) {
  const { customElementNames } = htmlSourceMeta

  const moduleCodeInject = `
    ;(async function() {
      const bridge = window.__bridge__
      const currentScript = document.currentScript

      const QSAO = (await bridge.importModule('qsa-observer')).default

      function observeConnections() {
        const { observer } = QSAO({
          query: [${customElementNames.map((n) => `'${n}'`).join(',')}],
          async handle(element, connected, selector) {
            const event = connected ? 'connected' : 'disconnected';
            if (event === 'connected') {

              // Wait for LitElement-based elements to render
              // https://lit-element.polymer-project.org/guide/lifecycle#performupdate
              await Promise.resolve()
              bridge.htmlSourceMeta.customElementOcurrences -= 1

              if (element.shadowRoot) {
                await bridge.renderDsdTemplates(element, window)
                bridge.extractCriticalCss(element, window)
              }

              if (bridge.htmlSourceMeta.customElementOcurrences === 0) {
                observer.disconnect()
                const containerEl = document.getElementById('${options.containerElId}')
                const htmlStr = containerEl.innerHTML
                Promise.resolve().then(() => bridge.rendered(htmlStr))

                // Clean up, in case this dom is reused
                containerEl.innerHTML = ''
                currentScript.remove()
              }
            }
          }
        })
      }

      bridge.whenAllDefined.done.then(observeConnections)

      ${scripts.reduce((injectCode, filePath) => {
        const resolvedPath = path.resolve(options.cwd, filePath)
        injectCode = injectCode + `bridge.importModule('${resolvedPath}');`
        return injectCode
      }, '')}

      ${customElementNames.reduce((injectCode, elName) => {
        injectCode =
          injectCode +
          `
            if (customElements.get('${elName}')) {
              bridge.whenAllDefined.defined('${elName}')
            } else {
              await customElements.whenDefined('${elName}')
              bridge.whenAllDefined.defined('${elName}')
            }
        `
        return injectCode
      }, '')}
    })()
    `

  const { document } = dom.window
  const script = document.createElement('script')
  script.textContent = moduleCodeInject
  document.body.append(script)
}

module.exports = injectScripts