"use strict";
var _a;
fetch('styles.css')
    .then((response) => response.text())
    .then((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})
    .catch((error) => console.error('Error loading CSS:', error));
let variablesData = []; // contains initial unfiltered data
let selectedVariables = []; // contains filtered data
let stylesData = [];
let startY;
let startX;
let startHeight;
let startWidth;
// document elements
const tooltip = document.getElementById('tooltip');
const filterInput = document.getElementById('filterInput');
const collectionSelector = document.getElementById('customCollectionSelector');
const optionsList = document.getElementById('collectionOptionsList');
const selectedOption = document.getElementById('selectedCollection');
const chevron = document.getElementById('chevron');
const updateButton = document.getElementById('updateButton');
const loadingSpinner = document.getElementById('loadingSpinner');
const resizableElement = document.querySelector('.content-wrapper');
updateButton === null || updateButton === void 0 ? void 0 : updateButton.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'reload-variables' } }, '*');
});
// Declaramos tooltipTimeout aquí para que esté disponible en todo el script
let tooltipTimeout;
// Mostrar tooltip centrado respecto al botón o fila de variable
function showTooltip(element, text, delay = 0) {
    tooltipTimeout = setTimeout(() => {
        const rect = element.getBoundingClientRect();
        if (tooltip) {
            tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
            tooltip.textContent = text;
            tooltip.style.visibility = 'visible';
        }
    }, delay); // Personaliza el retraso
}
// Ocultar el tooltip inmediatamente y cancelar el timeout
function hideTooltip() {
    clearTimeout(tooltipTimeout); // Cancelar el timeout si el mouse sale antes del delay
    if (tooltip)
        tooltip.style.visibility = 'hidden';
}
// Añadir eventos de tooltip a los botones y las filas de las variables
function addTooltipEvents() {
    const actionButtons = document.querySelectorAll('.action-button');
    const colorRows = document.querySelectorAll('.color-row'); // Seleccionamos las filas de variables
    // Eventos para los botones de acción
    actionButtons.forEach((button) => {
        const tooltipText = button.getAttribute('data-tooltip');
        if (!tooltipText)
            return;
        const isSpecialButton = ['Fill', 'Stroke'].includes(tooltipText);
        button.addEventListener('mouseenter', (event) => {
            const delay = isSpecialButton ? 400 : 0; // Retraso de 400ms solo para botones especiales
            if (!(event.currentTarget instanceof HTMLElement))
                return;
            showTooltip(event.currentTarget, tooltipText, delay);
        });
        button.addEventListener('mouseleave', hideTooltip);
    });
    // Eventos para las filas de variables
    colorRows.forEach((row) => {
        var _a;
        const variableName = (_a = row.querySelector('.alias')) === null || _a === void 0 ? void 0 : _a.textContent; // Tomamos el nombre de la variable
        // Mostrar tooltip al hacer clic (mousedown) y al soltar el mouse (mouseup)
        row.addEventListener('mousedown', (event) => {
            // Mostramos el tooltip sin retraso al hacer clic
            if (!(event.currentTarget instanceof HTMLElement))
                return;
            showTooltip(event.currentTarget, `${variableName}`, 0);
        });
        row.addEventListener('mouseup', hideTooltip); // Ocultar el tooltip al soltar el mouse
    });
}
// Recibir mensajes del código principal
onmessage = (event) => {
    const { pluginMessage } = event.data;
    if (pluginMessage.type === 'loading-start') {
        loadingSpinner === null || loadingSpinner === void 0 ? void 0 : loadingSpinner.classList.remove('hidden');
    }
    else if (pluginMessage.type === 'loading-end') {
        loadingSpinner === null || loadingSpinner === void 0 ? void 0 : loadingSpinner.classList.add('hidden');
    }
    if (pluginMessage.type === 'all-data') {
        variablesData = pluginMessage.variables;
        selectedVariables = variablesData;
        stylesData = pluginMessage.styles;
        const collectionNames = variablesData.reduce((acc, variable) => {
            if (!acc.includes(variable.collectionName)) {
                acc.push(variable.collectionName);
            }
            return acc;
        }, []);
        renderVariables(selectedVariables);
        renderStyles(stylesData);
        renderSelectorForCollections(collectionNames);
    }
};
// Cambiar entre pestañas
(_a = document.getElementById('tab-variables')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
    var _a, _b, _c, _d;
    (_a = document.getElementById('tab-variables')) === null || _a === void 0 ? void 0 : _a.classList.add('active');
    (_b = document.getElementById('tab-estilos')) === null || _b === void 0 ? void 0 : _b.classList.remove('active');
    (_c = document.getElementById('content-variables')) === null || _c === void 0 ? void 0 : _c.classList.add('active');
    (_d = document.getElementById('content-estilos')) === null || _d === void 0 ? void 0 : _d.classList.remove('active');
});
// Función para filtrar la lista de variables y estilos
filterInput === null || filterInput === void 0 ? void 0 : filterInput.addEventListener('input', function (e) {
    var _a, _b;
    const target = e.target;
    const filterValue = target.value.toLowerCase();
    if ((_a = document.getElementById('tab-variables')) === null || _a === void 0 ? void 0 : _a.classList.contains('active')) {
        const filteredVariables = selectedVariables.filter((v) => v.alias.toLowerCase().includes(filterValue));
        renderVariables(filteredVariables);
    }
    else if ((_b = document.getElementById('tab-estilos')) === null || _b === void 0 ? void 0 : _b.classList.contains('active')) {
        const filteredStyles = stylesData.filter((s) => s.name.toLowerCase().includes(filterValue));
        renderStyles(filteredStyles);
    }
});
// Renderizar variables de color
function renderVariables(variables) {
    const colorList = document.getElementById('colorListVariables');
    const emptyMessage = document.getElementById('emptyVariablesMessage');
    if (!colorList || !emptyMessage)
        return;
    colorList.innerHTML = '';
    if (Object.keys(variables).length === 0) {
        emptyMessage.style.display = 'block';
    }
    else {
        emptyMessage.style.display = 'none';
        const libraryNames = variables.reduce((acc, variable) => {
            if (!acc.includes(variable.libraryName)) {
                acc.push(variable.libraryName);
            }
            return acc;
        }, []);
        libraryNames.forEach((libraryName) => {
            const libraryVariables = variables.filter((variable) => variable.libraryName === libraryName);
            const libraryVariablesSplitByGroup = libraryVariables.reduce((acc, variable) => {
                const group = variable.alias.split('/');
                const groupIsPresent = group.length > 1;
                // groupName is everything except the last element or 'General' if there is no group
                const groupName = groupIsPresent ? group.slice(0, -1).join('/') : 'General';
                if (!(acc === null || acc === void 0 ? void 0 : acc[groupName])) {
                    acc[groupName] = [];
                }
                acc[groupName].push(variable);
                return acc;
            }, {});
            Object.entries(libraryVariablesSplitByGroup).forEach(([group, variables]) => {
                const libraryHeader = document.createElement('div');
                libraryHeader.className = 'library-header';
                const libraryNameSpan = document.createElement('span');
                libraryNameSpan.textContent = group !== 'General' ? `(${libraryName})` : libraryName;
                libraryNameSpan.className = group !== 'General' ? 'lib-name' : 'lib-name lib-name-general';
                const libraryGroupSpan = document.createElement('span');
                libraryGroupSpan.className = 'lib-group';
                libraryGroupSpan.textContent = group;
                if (group !== 'General') {
                    libraryHeader.appendChild(libraryGroupSpan);
                }
                libraryHeader.appendChild(libraryNameSpan);
                colorList.appendChild(libraryHeader);
                variables.forEach((variable) => {
                    const colorRow = document.createElement('div');
                    colorRow.className = 'color-row';
                    const colorDiv = document.createElement('div');
                    colorDiv.className = 'color-swatch';
                    if (variable.color) {
                        const red = Math.round(variable.color.r * 255);
                        const green = Math.round(variable.color.g * 255);
                        const blue = Math.round(variable.color.b * 255);
                        colorDiv.style.backgroundColor = `rgb(${red}, ${green}, ${blue})`;
                    }
                    else {
                        colorDiv.style.backgroundColor = '#ccc';
                    }
                    if (variable.isAlias) {
                        colorDiv.classList.add('alias-border');
                    }
                    const aliasDiv = document.createElement('div');
                    aliasDiv.className = 'alias';
                    const variableName = variable.alias.split('/').pop();
                    aliasDiv.textContent = variableName || 'Sin alias';
                    const actionButtons = document.createElement('div');
                    actionButtons.className = 'action-buttons';
                    const buttonF = document.createElement('div');
                    buttonF.className = 'action-button';
                    buttonF.setAttribute('data-tooltip', 'Fill');
                    buttonF.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
               <path fill-rule="evenodd" clip-rule="evenodd" d="M6 5H14C14.2652 5 14.5196 5.10536 14.7071 5.29289C14.8946 5.48043 15 5.73478 15 6V14C15 14.2652 14.8946 14.5196 14.7071 14.7071C14.5196 14.8946 14.2652 15 14 15H6C5.73478 15 5.48043 14.8946 5.29289 14.7071C5.10536 14.5196 5 14.2652 5 14V6C5 5.73478 5.10536 5.48043 5.29289 5.29289C5.48043 5.10536 5.73478 5 6 5ZM4 6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H14C14.5304 4 15.0391 4.21071 15.4142 4.58579C15.7893 4.96086 16 5.46957 16 6V14C16 14.5304 15.7893 15.0391 15.4142 15.4142C15.0391 15.7893 14.5304 16 14 16H6C5.46957 16 4.96086 15.7893 4.58579 15.4142C4.21071 15.0391 4 14.5304 4 14V6ZM13 7.5C13.1326 7.5 13.2598 7.44732 13.3536 7.35355C13.4473 7.25979 13.5 7.13261 13.5 7C13.5 6.86739 13.4473 6.74021 13.3536 6.64645C13.2598 6.55268 13.1326 6.5 13 6.5C12.8674 6.5 12.7402 6.55268 12.6464 6.64645C12.5527 6.74021 12.5 6.86739 12.5 7C12.5 7.13261 12.5527 7.25979 12.6464 7.35355C12.7402 7.44732 12.8674 7.5 13 7.5ZM11.5 9C11.5 9.13261 11.4473 9.25979 11.3536 9.35355C11.2598 9.44732 11.1326 9.5 11 9.5C10.8674 9.5 10.7402 9.44732 10.6464 9.35355C10.5527 9.25979 10.5 9.13261 10.5 9C10.5 8.86739 10.5527 8.74021 10.6464 8.64645C10.7402 8.55268 10.8674 8.5 11 8.5C11.1326 8.5 11.2598 8.55268 11.3536 8.64645C11.4473 8.74021 11.5 8.86739 11.5 9ZM9.5 11C9.5 11.1326 9.44732 11.2598 9.35355 11.3536C9.25979 11.4473 9.13261 11.5 9 11.5C8.86739 11.5 8.74021 11.4473 8.64645 11.3536C8.55268 11.2598 8.5 11.1326 8.5 11C8.5 10.8674 8.55268 10.74021 8.64645 10.6464C8.74021 10.5527 8.86739 10.5 9 10.5C9.13261 10.5 9.25979 10.5527 9.35355 10.6464C9.44732 10.7402 9.5 10.8674 9.5 11ZM7.5 13C7.5 13.1326 7.44732 13.2598 7.35355 13.3536C7.25979 13.4473 7.13261 13.5 7 13.5C6.86739 13.5 6.74021 13.4473 6.64645 13.3536C6.55268 13.2598 6.5 13.1326 6.5 13C6.5 12.8674 6.55268 12.7402 6.64645 12.6464C6.74021 12.5527 6.86739 12.5 7 12.5C7.13261 12.5 7.25979 12.5527 7.35355 12.6464C7.44732 12.7402 7.5 12.8674 7.5 13ZM9 13.5C9.13261 13.5 9.25979 13.4473 9.35355 13.3536C9.44732 13.2598 9.5 13.1326 9.5 13C9.5 12.8674 9.44732 12.7402 9.35355 12.6464C9.25979 12.5527 9.13261 12.5 9 12.5C8.86739 12.5 8.74021 12.5527 8.64645 12.6464C8.55268 12.7402 8.5 12.8674 8.5 13C8.5 13.1326 8.55268 13.2598 8.64645 13.3536C8.74021 13.4473 8.86739 13.5 9 13.5ZM11 11.5C11.1326 11.5 11.2598 11.4473 11.3536 11.3536C11.4473 11.2598 11.5 11.1326 11.5 11C11.5 10.8674 11.4473 10.7402 11.3536 10.6464C11.2598 10.5527 11.1326 10.5 11 10.5C10.8674 10.5 10.7402 10.5527 10.6464 10.6464C10.5527 10.7402 10.5 10.8674 10.5 11C10.5 11.1326 10.5527 11.2598 10.6464 11.3536C10.7402 11.4473 10.8674 11.5 11 11.5ZM11.5 13C11.5 13.1326 11.4473 13.2598 11.3536 13.3536C11.2598 13.4473 11.1326 13.5 11 13.5C10.8674 13.5 10.7402 13.4473 10.6464 13.3536C10.5527 13.2598 10.5 13.1326 10.5 13Z" fill="black" fill-opacity="0.501961"/>
            </svg>`;
                    buttonF.addEventListener('click', () => {
                        parent.postMessage({
                            pluginMessage: {
                                type: 'apply-color',
                                action: 'fill',
                                variableId: variable.id
                            }
                        }, '*');
                    });
                    const buttonS = document.createElement('div');
                    buttonS.className = 'action-button';
                    buttonS.setAttribute('data-tooltip', 'Stroke');
                    buttonS.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
               <path fill-rule="evenodd" clip-rule="evenodd" d="M4 4.5C4 4.36739 4.05268 4.24021 4.14645 4.14645C4.24021 4.05268 4.36739 4 4.5 4H15.5C15.6326 4 15.7598 4.05268 15.8536 4.14645C15.9473 4.24021 16 4.36739 16 4.5C16 4.63261 15.9473 4.75979 15.8536 4.85355C15.7598 4.94732 15.6326 5 15.5 5H4.5C4.36739 5 4.24021 4.94732 4.14645 4.85355C4.05268 4.75979 4 4.63261 4 4.5ZM5 8V9H15V8H5ZM4.75 7C4.55109 7 4.36032 7.07902 4.21967 7.21967C4.07902 7.36032 4 7.55109 4 7.75V9.25C4 9.664 4.336 10 4.75 10H15.25C15.4489 10 15.6397 9.92098 15.7803 9.78033C15.921 9.63968 16 9.44891 16 9.25V7.75C16 7.55109 15.921 7.36032 15.7803 7.21967C15.6397 7.07902 15.4489 7 15.25 7H4.75ZM5 15V13H15V15H5ZM4 12.75C4 12.5511 4.07902 12.3603 4.21967 12.2197C4.36032 12.079 4.55109 12 4.75 12H15.25C15.4489 12 15.6397 12.079 15.7803 12.2197C15.921 12.3603 16 12.5511 16 12.75V15.25C16 15.4489 15.921 15.6397 15.7803 15.7803C15.6397 15.921 15.4489 16 15.25 16H4.75C4.55109 16 4.36032 15.921 4.21967 15.7803C4.07902 15.6397 4 15.4489 4 15.25V12.75Z" fill="black" fill-opacity="0.501961"/>
            </svg>`;
                    buttonS.addEventListener('click', () => {
                        parent.postMessage({
                            pluginMessage: {
                                type: 'apply-color',
                                action: 'stroke',
                                variableId: variable.id
                            }
                        }, '*');
                    });
                    actionButtons.appendChild(buttonF);
                    actionButtons.appendChild(buttonS);
                    colorRow.appendChild(colorDiv);
                    colorRow.appendChild(aliasDiv);
                    colorRow.appendChild(actionButtons);
                    colorList.appendChild(colorRow);
                });
            });
        });
    }
    addTooltipEvents();
}
// Renderizar estilos de color
function renderStyles(styles) {
    const colorList = document.getElementById('colorListEstilos');
    const emptyMessage = document.getElementById('emptyStylesMessage');
    if (!colorList || !emptyMessage)
        return;
    colorList.innerHTML = '';
    if (styles.length === 0) {
        emptyMessage.style.display = 'block';
    }
    else {
        emptyMessage.style.display = 'none';
        styles.forEach((style) => {
            const colorRow = document.createElement('div');
            colorRow.className = 'color-row';
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-swatch';
            const paint = style.paints[0];
            if (paint && paint.color) {
                const red = Math.round(paint.color.r * 255);
                const green = Math.round(paint.color.g * 255);
                const blue = Math.round(paint.color.b * 255);
                colorDiv.style.backgroundColor = `rgb(${red}, ${green}, ${blue})`;
            }
            else {
                colorDiv.style.backgroundColor = '#ccc';
            }
            const nameDiv = document.createElement('div');
            nameDiv.className = 'alias';
            nameDiv.textContent = style.name || 'Sin nombre';
            const actionButtons = document.createElement('div');
            actionButtons.className = 'action-buttons';
            const buttonF = document.createElement('div');
            buttonF.className = 'action-button';
            buttonF.setAttribute('data-tooltip', 'Fill');
            buttonF.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M6 5H14C14.2652 5 14.5196 5.10536 14.7071 5.29289C14.8946 5.48043 15 5.73478 15 6V14C15 14.2652 14.8946 14.5196 14.7071 14.7071C14.5196 14.8946 14.2652 15 14 15H6C5.73478 15 5.48043 14.8946 5.29289 14.7071C5.10536 14.5196 5 14.2652 5 14V6C5 5.73478 5.10536 5.48043 5.29289 5.29289C5.48043 5.10536 5.73478 5 6 5ZM4 6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H14C14.5304 4 15.0391 4.21071 15.4142 4.58579C15.7893 4.96086 16 5.46957 16 6V14C16 14.5304 15.7893 15.0391 15.4142 15.4142C15.0391 15.7893 14.5304 16 14 16H6C5.46957 16 4.96086 15.7893 4.58579 15.4142C4.21071 15.0391 4 14.5304 4 14V6ZM13 7.5C13.1326 7.5 13.2598 7.44732 13.3536 7.35355C13.4473 7.25979 13.5 7.13261 13.5 7C13.5 6.86739 13.4473 6.74021 13.3536 6.64645C13.2598 6.55268 13.1326 6.5 13 6.5C12.8674 6.5 12.7402 6.55268 12.6464 6.64645C12.5527 6.74021 12.5 6.86739 12.5 7C12.5 7.13261 12.5527 7.25979 12.6464 7.35355C12.7402 7.44732 12.8674 7.5 13 7.5ZM11.5 9C11.5 9.13261 11.4473 9.25979 11.3536 9.35355C11.2598 9.44732 11.1326 9.5 11 9.5C10.8674 9.5 10.7402 9.44732 10.6464 9.35355C10.5527 9.25979 10.5 9.13261 10.5 9C10.5 8.86739 10.5527 8.74021 10.6464 8.64645C10.7402 8.55268 10.8674 8.5 11 8.5C11.1326 8.5 11.2598 8.55268 11.3536 8.64645C11.4473 8.74021 11.5 8.86739 11.5 9ZM9.5 11C9.5 11.1326 9.44732 11.2598 9.35355 11.3536C9.25979 11.4473 9.13261 11.5 9 11.5C8.86739 11.5 8.74021 11.4473 8.64645 11.3536C8.55268 11.2598 8.5 11.1326 8.5 11C8.5 10.8674 8.55268 10.74021 8.64645 10.6464C8.74021 10.5527 8.86739 10.5 9 10.5C9.13261 10.5 9.25979 10.5527 9.35355 10.6464C9.44732 10.7402 9.5 10.8674 9.5 11ZM7.5 13C7.5 13.1326 7.44732 13.2598 7.35355 13.3536C7.25979 13.4473 7.13261 13.5 7 13.5C6.86739 13.5 6.74021 13.4473 6.64645 13.3536C6.55268 13.2598 6.5 13.1326 6.5 13C6.5 12.8674 6.55268 12.7402 6.64645 12.6464C6.74021 12.5527 6.86739 12.5 7 12.5C7.13261 12.5 7.25979 12.5527 7.35355 12.6464C7.44732 12.7402 7.5 12.8674 7.5 13ZM9 13.5C9.13261 13.5 9.25979 13.4473 9.35355 13.3536C9.44732 13.2598 9.5 13.1326 9.5 13C9.5 12.8674 9.44732 12.7402 9.35355 12.6464C9.25979 12.5527 9.13261 12.5 9 12.5C8.86739 12.5 8.74021 12.5527 8.64645 12.6464C8.55268 12.7402 8.5 12.8674 8.5 13C8.5 13.1326 8.55268 13.2598 8.64645 13.3536C8.74021 13.4473 8.86739 13.5 9 13.5ZM11 11.5C11.1326 11.5 11.2598 11.4473 11.3536 11.3536C11.4473 11.2598 11.5 11.1326 11.5 11C11.5 10.8674 11.4473 10.7402 11.3536 10.6464C11.2598 10.5527 11.1326 10.5 11 10.5C10.8674 10.5 10.7402 10.5527 10.6464 10.6464C10.5527 10.7402 10.5 10.8674 10.5 11C10.5 11.1326 10.5527 11.2598 10.6464 11.3536C10.7402 11.4473 10.8674 11.5 11 11.5ZM11.5 13C11.5 13.1326 11.4473 13.2598 11.3536 13.3536C11.2598 13.4473 11.1326 13.5 11 13.5C10.8674 13.5 10.7402 13.4473 10.6464 13.3536C10.5527 13.2598 10.5 13.1326 10.5 13Z" fill="black" fill-opacity="0.501961"/>
</svg>`;
            buttonF.addEventListener('click', () => {
                parent.postMessage({ pluginMessage: { type: 'apply-style', action: 'fill', styleId: style.id } }, '*');
            });
            const buttonS = document.createElement('div');
            buttonS.className = 'action-button';
            buttonS.setAttribute('data-tooltip', 'Stroke');
            buttonS.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 4.5C4 4.36739 4.05268 4.24021 4.14645 4.14645C4.24021 4.05268 4.36739 4 4.5 4H15.5C15.6326 4 15.7598 4.05268 15.8536 4.14645C15.9473 4.24021 16 4.36739 16 4.5C16 4.63261 15.9473 4.75979 15.8536 4.85355C15.7598 4.94732 15.6326 5 15.5 5H4.5C4.36739 5 4.24021 4.94732 4.14645 4.85355C4.05268 4.75979 4 4.63261 4 4.5ZM5 8V9H15V8H5ZM4.75 7C4.55109 7 4.36032 7.07902 4.21967 7.21967C4.07902 7.36032 4 7.55109 4 7.75V9.25C4 9.664 4.336 10 4.75 10H15.25C15.4489 10 15.6397 9.92098 15.7803 9.78033C15.921 9.63968 16 9.44891 16 9.25V7.75C16 7.55109 15.921 7.36032 15.7803 7.21967C15.6397 7.07902 15.4489 7 15.25 7H4.75ZM5 15V13H15V15H5ZM4 12.75C4 12.5511 4.07902 12.3603 4.21967 12.2197C4.36032 12.079 4.55109 12 4.75 12H15.25C15.4489 12 15.6397 12.079 15.7803 12.2197C15.921 12.3603 16 12.5511 16 12.75V15.25C16 15.4489 15.921 15.6397 15.7803 15.7803C15.6397 15.921 15.4489 16 15.25 16H4.75C4.55109 16 4.36032 15.921 4.21967 15.7803C4.07902 15.6397 4 15.4489 4 15.25V12.75Z" fill="black" fill-opacity="0.501961"/>
</svg>`;
            buttonS.addEventListener('click', () => {
                parent.postMessage({
                    pluginMessage: {
                        type: 'apply-style',
                        action: 'stroke',
                        styleId: style.id
                    }
                }, '*');
            });
            actionButtons.appendChild(buttonF);
            actionButtons.appendChild(buttonS);
            colorRow.appendChild(colorDiv);
            colorRow.appendChild(nameDiv);
            colorRow.appendChild(actionButtons);
            colorList.appendChild(colorRow);
        });
    }
    addTooltipEvents();
}
function renderSelectorForCollections(collectionNames) {
    collectionSelector === null || collectionSelector === void 0 ? void 0 : collectionSelector.addEventListener('click', selectorClick);
    generateCollectionOption('All collections');
    collectionNames.forEach(generateCollectionOption);
}
function createClickAwayListener(element, callback) {
    document.addEventListener('click', (e) => {
        if (e.target instanceof HTMLElement && !element.contains(e.target)) {
            callback();
        }
    });
}
function selectorClick(e) {
    e.stopPropagation();
    chevron === null || chevron === void 0 ? void 0 : chevron.classList.toggle('rotated');
    optionsList === null || optionsList === void 0 ? void 0 : optionsList.classList.toggle('hidden');
    if (!collectionSelector || !optionsList)
        return;
    createClickAwayListener(collectionSelector, handleHideOptions);
}
function generateCollectionOption(collectionName) {
    const spanOption = document.createElement('span');
    spanOption.className = 'collection-option';
    spanOption.textContent = collectionName;
    spanOption.addEventListener('click', collectionClick(collectionName));
    optionsList === null || optionsList === void 0 ? void 0 : optionsList.appendChild(spanOption);
}
function collectionClick(collectionName) {
    return function (e) {
        e.stopPropagation();
        selectedVariables =
            collectionName === 'All collections'
                ? variablesData
                : variablesData.filter((v) => v.collectionName === collectionName);
        renderVariables(selectedVariables);
        if (!selectedOption || !filterInput)
            return;
        selectedOption.textContent = collectionName;
        handleHideOptions();
        filterInput.value = '';
    };
}
function handleHideOptions() {
    optionsList === null || optionsList === void 0 ? void 0 : optionsList.classList.add('hidden');
    chevron === null || chevron === void 0 ? void 0 : chevron.classList.remove('rotated');
}
resizableElement === null || resizableElement === void 0 ? void 0 : resizableElement.addEventListener('mousedown', (event) => {
    startY = event.clientY;
    startX = event.clientX;
    startHeight = window.innerHeight;
    startWidth = window.innerWidth;
    document.addEventListener('mousemove', resizeHandler);
    document.addEventListener('mouseup', stopResize);
});
function resizeHandler(event) {
    const newHeight = startHeight + (event.clientY - startY);
    const newWidth = startWidth + (event.clientX - startX);
    parent.postMessage({ pluginMessage: { type: 'resize', height: newHeight, width: newWidth } }, '*');
}
function stopResize() {
    document.removeEventListener('mousemove', resizeHandler);
    document.removeEventListener('mouseup', stopResize);
}
