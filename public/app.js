const tablesGrid = document.getElementById('tables-grid');
const reservationForm = document.getElementById('reservation-form');
const messageEl = document.getElementById('message');
const refreshBtn = document.getElementById('refresh-btn');
const startTimeInput = document.getElementById('startTime');

const formatDateTime = (isoDate) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));

const renderTables = (tables) => {
  tablesGrid.innerHTML = '';

  tables.forEach((table) => {
    const card = document.createElement('article');
    card.className = `table-card ${table.isReserved ? 'reserved' : 'available'}`;

    card.innerHTML = `
      <h3>Table ${table.id}</h3>
      <p><strong>Status:</strong> ${table.isReserved ? 'Reserved' : 'Available'}</p>
      ${
        table.isReserved
          ? `<p><strong>Booked By:</strong> ${table.customerName}</p>
             <p><strong>Reserved From:</strong> ${formatDateTime(table.reservedAt)}</p>
             <p><strong>Available At:</strong> ${formatDateTime(table.reservedUntil)}</p>`
          : '<p>Ready for booking.</p>'
      }
    `;

    tablesGrid.appendChild(card);
  });
};

const showMessage = (text, type) => {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
};

const loadTables = async () => {
  const response = await fetch('/api/tables');
  const data = await response.json();
  renderTables(data.tables);
};

reservationForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(reservationForm);
  const startTimeValue = String(formData.get('startTime'));
  const parsedStartTime = new Date(startTimeValue);
  if (Number.isNaN(parsedStartTime.getTime())) {
    showMessage('Please provide a valid reservation start time.', 'error');
    return;
  }

  const payload = {
    tableId: Number(formData.get('tableId')),
    customerName: String(formData.get('customerName')),
    durationMinutes: Number(formData.get('durationMinutes')),
    startTime: parsedStartTime.toISOString(),
  };

  const response = await fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const timing = data.table?.reservedAt && data.table?.reservedUntil
      ? ` Reserved from ${formatDateTime(data.table.reservedAt)} until ${formatDateTime(data.table.reservedUntil)}.`
      : '';
    showMessage(`${data.error}${timing}`, 'error');
    return;
  }

  const successTiming = data.table?.reservedAt && data.table?.reservedUntil
    ? ` Reserved from ${formatDateTime(data.table.reservedAt)} until ${formatDateTime(data.table.reservedUntil)}.`
    : '';
  showMessage(`${data.message}${successTiming}`, 'success');
  reservationForm.reset();
  setDefaultStartTime();
  loadTables();
});

refreshBtn.addEventListener('click', loadTables);


const toDateTimeLocalValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const setDefaultStartTime = () => {
  const start = new Date(Date.now() + 15 * 60 * 1000);
  start.setSeconds(0, 0);
  startTimeInput.min = toDateTimeLocalValue(new Date());
  startTimeInput.value = toDateTimeLocalValue(start);
};

setDefaultStartTime();

loadTables();
setInterval(loadTables, 30000);
