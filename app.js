window.addEventListener('DOMContentLoaded', loadCSVData);
let allProducts = [];
let currentPage = 1;
let colCount = 0;
let selectedProduct = [];
let filteredProducts = [];
let searchPrefix = "";
let selectedLifecycleFilters = [];
let checkedBoxes = [];
const filterButton = document.getElementById('startsubmit');
const filterInput = document.getElementById('filterInput');
const clearButton = document.getElementById('clear');
const pageElement = document.getElementById('page-select');
let itemsPerPage = 20;
const downloadTable = document.getElementById('downloadbtn');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function bindComparisonDownloadButton() {
    const compDownload = document.getElementById('compDownload');
    if (!compDownload) {
        return;
    }
    compDownload.onclick = () => {
        console.log('Comparison download started');
        if (selectedProduct.length < 1) {
            console.log("No products selected");
            return;
        }
        exportTabletoCSV('comparison', `${selectedProduct[0]?.['title']??"N/A"}_${selectedProduct[1]?.['title']??"N/A"}_comparison.csv`);
    };
}
const tableBody = document.getElementById('table-body');
const maxSelection = 2;
tableBody.addEventListener('change', (event) => {
    if (event.target.classList.contains('product-checkbox')){
        const currentBox = event.target;
        const catalogId = currentBox.getAttribute('data-catalog');
    if (currentBox.checked){
        fetchFullDescription(catalogId);
        checkedBoxes.push(currentBox);
    }
    if (checkedBoxes.length > maxSelection){
        const oldestBox = checkedBoxes.shift();
        oldestBox.checked = false;
    }
}
});

downloadTable.addEventListener('click', () => {
    console.log('Button clicked');
    exportTabletoCSV('product-table', `${currentPage}_products.csv`);
});

pageElement.addEventListener('change', () => {
    itemsPerPage = pageElement.value;
    renderTable();
});

if (filterButton && filterInput) {
    filterButton.addEventListener('click', () => {
        applyTextFilter();
    });
}

clearButton.addEventListener('click', () => {
    searchPrefix = "";
    filterInput.value = "";
    applyTextFilter();
});

const lifecycleStatusCache = new Map();
const rockwellSearchUrl = 'https://api.rockwellautomation.com/ra-eapi-cx-public-dashboard-vpcprod/api/v1/rockwell/search';
const rockwellSearchHeaders = {
    'client_id': 'fb000cbbe476420b9e70be741abd7a63',
    'client_secret': 'Db420ae8BAdD47ADA4E12cE90Fb1b747',
    'correlation_id': 'prod_ra_com_search',
    'content-type': 'application/json',
    'origin': 'https://www.rockwellautomation.com',
    'referer': 'https://www.rockwellautomation.com/'
};
document.querySelectorAll('input[name="lifecycle"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        selectedLifecycleFilters = Array.from(
            document.querySelectorAll('input[name="lifecycle"]:checked')
        ).map(cb => cb.value.toLowerCase());
        filter(selectedLifecycleFilters);
        console.log(selectedLifecycleFilters);
    });
});
const comparisonFields = [
    { label: "Type", property: "type" },
    { label: "Brand", property: "brand" },
    { label: "Replacement Category", property: "replacementCategory" },
    { label: "Replacement Text", property: "replacementText" },
    { label: "Catalog Number", property: "catalogNumber" },
    { label: "Lifecycle Status", property: "productLifeCycleStatus" },
    { label: "Discontinued Date", property: "discontinuedDate" }
];

function exportTabletoCSV(table_id, filename){
    const table = document.getElementById(table_id);
    const csvData = [];
    if (table.rows.length < 2){
        return;
    }
    
    for (const row of table.rows){
        const rowValues = [];
        for (let i=0; i<3; i++){
            rowValues.push(row.cells[i].innerText.trim());
        }
        csvData.push(rowValues.join(','));
    }
    const csvContent = csvData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

async function loadCSVData() {
    try {
        const response = await fetch('data/catalog_number_description.csv');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const csvText = await response.text();
        const rows = csvText.split('\n');

        allProducts = rows
            .map(row => row.trim())
            .filter(row => row !== '')
            .map(row => {
                const columns = row.split(',');
                return {
                    catalog: columns[1] ? columns[1].trim() : '',
                    name: columns[2] ? columns[2].trim() : ''
                };
            });

        currentPage = 1;
        filteredProducts = allProducts;
        await renderTable();

    //     allProducts.forEach(product => fetchLifecycleStatus(product.catalog));
    //     allProducts.forEach(async (product) => {
    // Object.assign(product, await fetchLifecycleStatus(product.catalog));});
    const BATCH_SIZE = 20;
    const DELAY = 100; // ms

    (async () => {
        for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {

            const batch = allProducts.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async product => {
                    Object.assign(product, await fetchLifecycleStatus(product.catalog));
                })
            );

            if (i + BATCH_SIZE < allProducts.length) {
                await sleep(DELAY);
            }
        }
    })();
    } catch (error) {
        console.error('Error loading csv file: ', error);
    }
}

async function fetchLifecycleStatus(catalogNumber) {
    const normalizedQuery = catalogNumber.trim();
    if (!normalizedQuery) {
        return {lifecycleStatus: 'N/A',
            productURL: 'N/A',
            title: 'N/A',
        };
    }   

    const cacheKey = normalizedQuery.toLowerCase();
    if (lifecycleStatusCache.has(cacheKey)) {
        return lifecycleStatusCache.get(cacheKey);
    }
    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem !== null){
        const parsedItem = JSON.parse(cachedItem);
        const isExpired = Date.now() - parsedItem.timestamp > CACHE_TTL_MS;
        if (!isExpired){
            lifecycleStatusCache.set(cacheKey, parsedItem.data);
            return parsedItem.data;
        }
        else{
            localStorage.removeItem(cacheKey);
        }
    }
    try {
        const searchUrl = `${rockwellSearchUrl}?query=${encodeURIComponent(normalizedQuery)}&tab=lifecycle&from=0&size=24&locale=en-US`;
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: rockwellSearchHeaders
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const firstDoc = Array.isArray(data.docs) ? data.docs[0] : data.docs;
        const lifecycleStatus = firstDoc?.productLifeCycleStatus || 'N/A';
        const productURL = firstDoc?.url || 'N/A';
        const title = firstDoc?.title || 'N/A';
        result = {lifecycleStatus, productURL, title};
        const wrappedResult = {
            data: result,
            timestamp: Date.now()
        };
        lifecycleStatusCache.set(cacheKey, result);
        localStorage.setItem(cacheKey, JSON.stringify(wrappedResult));
        return result;
    } catch (error) {
        console.error('Error loading lifecycle status: ', error);
        return {lifecycleStatus: 'N/A',
            productURL: 'N/A',
            title: 'N/A',
        };
    }
}

async function fetchFullDescription(catalogNumber){
    const normalizedQuery = catalogNumber.trim();
    if (!normalizedQuery){
        return "N/A";
    }
    const cacheKey = normalizedQuery.toLowerCase();
    try {
        const searchUrl = `${rockwellSearchUrl}?query=${encodeURIComponent(normalizedQuery)}&tab=lifecycle&from=0&size=24&locale=en-US`;
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: rockwellSearchHeaders
        });
        if (!response.ok){
            throw new Error(`Full description HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const firstDoc = Array.isArray(data.docs) ? data.docs[0] : data.docs;
        selectedProduct[(colCount++)%2]=firstDoc;
        return 'Done';
    } catch(error){
        console.error('Error loading product description: ', error);
        return 'N/A';
    }
}

async function renderComparisonTable(){
    if (checkedBoxes.length < maxSelection){
        alert("Select atleast two products!");
    }
    const comparisonToolbar = document.getElementById('comparison-toolbar');
    const tableBody = document.getElementById('comparison');
    tableBody.innerHTML=`
    <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#5b0b0b; font-weight:700;">
                Loading product description...
            </td>
        </tr>
    `;
    const tableHead = document.getElementById('compHead');
    const leftHead = selectedProduct[0]?.['title']??"Loading..";
    const rightHead = selectedProduct[1]?.['title']??"Loading..";
    tableHead.innerHTML=`
    <tr>
        <th> </th>
        <th>${leftHead}</th>
        <th>${rightHead}</th>
    </tr>
    `
    tableBody.innerHTML = '';
    comparisonFields.forEach(field=> {
        const row = document.createElement('tr');

        const label = field.label;
        const leftValue = selectedProduct[0]?.[field.property]??"N/A";
        const rightValue = selectedProduct[1]?.[field.property]??"N/A";
        row.innerHTML= `
            <td>${label}</td>
            <td>${leftValue}</td>
            <td>${rightValue}</td>
        `
        tableBody.appendChild(row);
    });
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });
    let downBtn = document.getElementById('compDownload');
    if (!downBtn){
        const downBtn = document.createElement('button');
        downBtn.innerHTML = `Download Comparison`
        downBtn.type = 'button';
        downBtn.className = 'navigate'
        downBtn.id = 'compDownload'
        comparisonToolbar.appendChild(downBtn);
    }
    bindComparisonDownloadButton();
}

async function renderTable() {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#5b0b0b; font-weight:700;">
                Loading lifecycle status...
            </td>
        </tr>
    `;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredProducts.slice(startIndex, endIndex);

    // const pageRows = await Promise.all(pageItems.map(async product => ({
    //     ...product,
    //     ...await fetchLifecycleStatus(product.catalog)
    // })));

    tableBody.innerHTML = '';

    // pageRows.forEach(product => {
    //     const rowHTML = `
    //     <tr>
    //         <td>${product.catalog}</td>
    //         <td><a href="${product.productURL}" target="_blank" rel="noopener noreferrer" class="productURL">${product.title}</a></td>
    //         <td data-status="${product.lifecycleStatus}">${product.lifecycleStatus}</td>
    //         <td><button onclick="renderComparisonTable('${product.catalog}')" class="navigate compare-button">Compare</button></td>
    //     </tr>`;
    //     tableBody.insertAdjacentHTML('beforeend', rowHTML);
    // });
// <button onclick="renderComparisonTable('${product.catalog}')" class="navigate compare-button">
            //     Compare
            // </button>
    pageItems.forEach(product => {
    const row = `
    <tr id="row-${product.catalog}">
        <td>${product.catalog}</td>
        <td>Loading...</td>
        <td>Loading...</td>
        <td>
            <label class="container">
            <input type="checkbox" class="product-checkbox" data-catalog="${product.catalog}">
            </label>
        </td>
    </tr>
    `;

    tableBody.insertAdjacentHTML("beforeend", row);

    fetchLifecycleStatus(product.catalog)
        .then(data => {
            const row = document.getElementById(`row-${product.catalog}`);
            if (!row) return;

            row.cells[1].innerHTML =
                `<a href="${data.productURL}" target="_blank" rel="noopener noreferrer" class="productURL">${data.title}</a>`;
            row.cells[2].setAttribute("data-status", data.lifecycleStatus);
            row.cells[2].textContent = data.lifecycleStatus;
        });
});
    updatePaginationControls();
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
    const targetPage = currentPage + direction;

    if (targetPage >= 1 && targetPage <= totalPages) {
        currentPage = targetPage;
        renderTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function filter(selectedValues) {
    const textQuery = filterInput.value.trim().toLowerCase();
    
    let tempProducts = [...allProducts];

    if (textQuery !== "") {
        tempProducts = tempProducts.filter(product => 
            (product.catalog && product.catalog.toLowerCase().startsWith(textQuery)) || 
            (product.name && product.name.toLowerCase().startsWith(textQuery))
        );

        if (selectedValues && selectedValues.length > 0) {
            const lifecycleResults = await Promise.all(tempProducts.map(async product => {
                const lifecycleData = await fetchLifecycleStatus(product.catalog);
                return { ...product, ...lifecycleData };
            }));
            
            tempProducts = lifecycleResults.filter(product =>
                selectedValues.includes((product.lifecycleStatus || '').toLowerCase())
            );
        }

        currentPage = 1; 
        filteredProducts = tempProducts;

    } 
    else {
        if (selectedValues && selectedValues.length > 0) {
            // const startIndex = (currentPage - 1) * itemsPerPage;
            // const endIndex = startIndex + Number(itemsPerPage);
            
            const startIndex = 0;
            const endIndex = tempProducts.lengthl;

            let pageProducts = tempProducts.slice(startIndex, endIndex);

            const lifecycleResults = await Promise.all(pageProducts.map(async product => {
                const lifecycleData = await fetchLifecycleStatus(product.catalog);
                return { ...product, ...lifecycleData };
            }));

            filteredProducts = lifecycleResults.filter(product =>
                selectedValues.includes((product.lifecycleStatus || '').toLowerCase())
            );
            currentPage = 1;
            
        } else {
            filteredProducts = tempProducts;
        }
    }

    renderTable();
}

function applyTextFilter() {
    filter(selectedLifecycleFilters);
}

// function filter(selectedValues){
//     if (selectedValues.length == 0){
//         filteredProducts = [...allProducts];
//     } else{
//         filteredProducts = allProducts.filter(product =>
//             selectedValues.includes(product.lifecycleStatus.toLowerCase())
//         );
//     }
//     currentPage = 1;
//     renderTable();
// }



// function applyFilters() {

//     filteredProducts = allProducts.filter(product => {

//         const matchesText =
//             searchPrefix === "" ||
//             product.catalog.toLowerCase().startsWith(searchPrefix) ||
//             product.name.toLowerCase().startsWith(searchPrefix);

//         const matchesLifecycle =
//             selectedLifecycleFilters.length === 0 ||
//             selectedLifecycleFilters.includes(
//                 (product.lifecycleStatus || "N/A").toLowerCase()
//             );

//         return matchesText && matchesLifecycle;
//     });

//     currentPage = 1;
//     renderTable();
// }

function updatePaginationControls() {
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
    document.getElementById('page-indicator').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prev-btn').disabled = currentPage === 1;
    document.getElementById('next-btn').disabled = currentPage === totalPages;
}