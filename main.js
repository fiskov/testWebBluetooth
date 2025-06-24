PRIMARY_SERVICE = 0xFFAA
CHAR_NOTICE = 0xFF00
CHAR_REQ = 0xFF01

// Получение ссылок на элементы UI
let connectButton = document.getElementById('connect');
let disconnectButton = document.getElementById('disconnect');
let hiButton = document.getElementById('hiButton');
let terminalContainer = document.getElementById('terminal');
let sendForm = document.getElementById('send-form');
let inputField = document.getElementById('input');

let hi_msg = new TextEncoder().encode("phi");

// Подключение к устройству при нажатии на кнопку Connect
connectButton.addEventListener('click', function() {
  connect();
});

// Отключение от устройства при нажатии на кнопку Disconnect
disconnectButton.addEventListener('click', function() {
  disconnect();
});
// Послать запрос "hi" на устройство
hiButton.addEventListener('click', function() {
  writeToCharacteristic(characteristicCacheReq, strToArr("706869"));
});
// Обработка события отправки формы
sendForm.addEventListener('submit', function(event) {
  event.preventDefault(); // Предотвратить отправку формы
  send(inputField.value); // Отправить содержимое текстового поля
  inputField.value = '';  // Обнулить текстовое поле
  inputField.focus();     // Вернуть фокус на текстовое поле
});

// Кэш объекта выбранного устройства
let deviceCache = null;
// Кэш объекта сервиса
let serviceCache = null;
// Кэш объекта характеристики
let characteristicCache = null;
let characteristicCacheReq = null;

// Промежуточный буфер для входящих данных
let readBuffer = '';

// Запустить выбор Bluetooth устройства и подключиться к выбранному
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
      requestBluetoothDevice()).
      then(device => connectDeviceAndCacheCharacteristic(device)).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Запрос выбора Bluetooth устройства
function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
    filters: [{services: [PRIMARY_SERVICE]}],
  }).
      then(device => {
        log('"' + device.name + '"' + device.id + '] bluetooth device selected');
        deviceCache = device;
        deviceCache.addEventListener('gattserverdisconnected',
            handleDisconnection);

        return deviceCache;
      });
}

// Обработчик разъединения
function handleDisconnection(event) {
  let device = event.target;

  log('"' + device.name +
      '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Подключение к определенному устройству, получение сервиса и характеристики
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
      then(server => {
        log('GATT server connected, getting service...');

        return server.getPrimaryService(PRIMARY_SERVICE);
      }).
      then(service => {
        log('Service found, getting characteristic req...');
        serviceCache = service

        return service.getCharacteristic(CHAR_REQ);
      }).
      then(characteristic => {
        log('Characteristic found');
        characteristicCacheReq = characteristic;

        return characteristicCacheReq;
      }).
      then(_ => {
        log('Service found, getting characteristic notice...');

        return serviceCache.getCharacteristic(CHAR_NOTICE);
      }).
      then(characteristic => {
        log('Characteristic found');
        characteristicCache = characteristic;

        return characteristicCache;
      });
}

// Включение получения уведомлений об изменении характеристики
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
      then(() => {
        log('Notifications started');
        characteristic.addEventListener('characteristicvaluechanged',
            handleCharacteristicValueChanged);
      });
}

// Получение данных
function handleCharacteristicValueChanged(event) {
  
  let value = new TextDecoder().decode(event.target.value);

  for (let c of value) {
    if (c === '\n') {
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        receive(data);
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Обработка полученных данных
function receive(data) {
  log(data, 'in');
}

// Вывод в терминал
function log(data, type = '') {
  terminalContainer.insertAdjacentHTML('beforeend',
      '<div' + (type ? ' class="' + type + '"' : '') + '>' + data + '</div>');
}

// Отключиться от подключенного устройства
function disconnect() {
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
        handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
          '" bluetooth device is already disconnected');
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
        handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
}

function strToArr(str) {
  var arr = str.match(/[0-9a-f]{2}/ig); // convert into array of hex pairs
  arr = arr.map(x => parseInt(x, 16)); // convert hex pairs into ints (bytes)
  return (new Uint8Array(arr).buffer);
}

// Отправить данные подключенному устройству
function send(data) {
  data = String(data);

  if (!data || !characteristicCacheReq) {
    return;
  }

  writeToCharacteristic(characteristicCacheReq, strToArr(data));

  log(data, 'out');
}

// Записать значение (uint8array) в характеристику
function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(data);
}
