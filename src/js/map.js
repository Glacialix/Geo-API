'use strict'

ymaps.ready(init);
function init() {
  let map = new ymaps.Map('map',
    {
      center: [59.94, 30.32],
      zoom: 13,
      controls: ['searchControl']
    },
    {
      suppressObsoleteBrowserNotifier: true,
      yandexMapDisablePoiInteractivity: true,
      suppressMapOpenBlock: true
    }
  );
  let objectManager = new ymaps.ObjectManager({
    clusterize: true,
    geoObjectOpenBalloonOnClick: false,
    clusterOpenBalloonOnClick: true,
    clusterDisableClickZoom: true,
    clusterBalloonContentLayout: 'cluster#balloonCarousel',
  });

  map.geoObjects.add(objectManager);
  map.behaviors.disable(['dblClickZoom']);
  objectManager.objects.options.set('preset', 'islands#darkGreenDotIcon');
  objectManager.clusters.options.set('preset', 'islands#darkGreenClusterIcons');

  map.events.add('click', event => openInput(event));
  objectManager.objects.events.add(['click'], openInput);

  // служебные переменные, нужные для создания новых меток
  let coords = [];
  let address = ''
  let objId = 0;

  // если в localstorage сохранены какие-то данные о метках, поставленных ранее
  // пробегаем по массиву и проставляем эти метки на карте
  if (localStorage.placemarksStorage) {
    let placemarksStorage = JSON.parse(localStorage.placemarksStorage);

    for (objId; objId < placemarksStorage.length;) {
      addPlacemark(placemarksStorage[objId]);
    }
  }

  const inputBlock = document.querySelector('.map-input');
  const inputHeaderText = inputBlock.querySelector('.map-input__header-text');
  const inputFeedbackList = inputBlock.querySelector('.map-input__feedback-list');
  const inputFields = inputBlock.querySelectorAll('.map-input__input');
  const inputSubmitButton = inputBlock.querySelector('.map-input__button');
  const inputCloseButton = inputBlock.querySelector('.map-input__close');

  inputSubmitButton.addEventListener('click', () => {
    let inputName = inputFields[0].value;
    let inputPlace = inputFields[1].value;
    let inputFeedback = inputFields[2].value;
    let inputDate = formatDate(new Date);
    let isNotValidInput = false

    if (inputName.trim() === '') {
      alert('Вы не ввели имя!')
      isNotValidInput = true
    } else if (inputPlace.trim() === '') {
      alert('Вы не ввели место!')
      isNotValidInput = true
    } else if (inputFeedback.trim() === '') {
      alert('Вы не поделились впечатлениями!')
      isNotValidInput = true
    }

    if (isNotValidInput) {
      return
    }

    let placemarkDataObj = {
      coords: coords,
      address: address,
      objId: objId,
      feedback: {
        inputName: inputName,
        inputPlace: inputPlace,
        inputFeedback: inputFeedback,
        inputDate: inputDate
      }
    }

    addPlacemark(placemarkDataObj);

    // в localstorage параметр в виде строки; он либо уже содержит данные, либо его нет
    // либо мы парсим строку, получая массив, либо создаем пустой массив
    let placemarksStorage = localStorage.placemarksStorage ? JSON.parse(localStorage.placemarksStorage) : [];

    // добавляем в этот массив данные о новой метке
    placemarksStorage.push(placemarkDataObj);
    // преобразуем полученный массив обратно в строку
    placemarksStorage = JSON.stringify(placemarksStorage);
    // задаем localstorage обновленный массив в качестве значения
    localStorage.placemarksStorage = placemarksStorage;

    inputBlock.style.display = 'none';
  })

  inputCloseButton.addEventListener('click', () => inputBlock.style.display = 'none')

  // при открытии балуна кластера, там есть ссылка, которая должна вести на инпут этого элемента
  document.addEventListener('click', event => {
    if (event.target.classList.contains('baloon__link-btn')) {
      event.preventDefault();
      openInput(event);
    }
  })

  // получаем асинхронно адрес по координатам клика через апи карт
  function getClickLocation(coords) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(coords)
        .then(res => {
          let geoObject = res.geoObjects.get(0);
          let clickLocation = geoObject.getAddressLine();

          resolve(clickLocation)
        })
        .catch(e => reject(e))
    })
  }

  function addPlacemark(options) {
    let featuresObj = {
      'type': 'Feature',
      'id': options.objId,
      'geometry': {
        'type': 'Point',
        'coordinates': options.coords
      },
      'properties': {
        'balloonContentHeader': `<b>${options.feedback.inputPlace}</b>`,
        'balloonContentBody': `<a class="baloon__link-btn">${options.address}</a>
                              <br><br><p>${options.feedback.inputFeedback}</p>`,
        'balloonContentFooter': `${options.feedback.inputDate}`,
      }
    };

    objectManager.add({
      'type': 'FeatureCollection',
      'features': [featuresObj]
    });

    objId++;
  }

  // функция открытия инпута для добавления метки. тут я пытался реализовать полиморфизм
  // и сделать так чтобы оно уж там само решало откуда её вызывают и соответственно реагировало
  function openInput(event) {
    // чистим инпуты перед открытием
    for (let i = 0; i < inputFields.length; i++) {
      inputFields[i].value = '';
    }

    // если у события есть таргет, значит была нажата ссылка в балуне кластера
    if (typeof event.target !== 'undefined') {
      openInputOnClusterLinkClicked(event);
    }

    // если был совершен клик на метку, objectId !== undefined, в инрм случае - это был клик по карте
    event.get('objectId') >= 0 ? openInputOnPlacemarkClicked(event) : openInputOnMapClicked(event)
  }

  function openInputOnClusterLinkClicked(event) {
    let placemarksStorage = JSON.parse(localStorage.placemarksStorage);

    address = event.target.innerText;
    inputHeaderText.innerHTML = address;
    getFeedbacksForAdress(address);
    // берем координаты первой метки по этому адресу
    for (let i = 0; i < placemarksStorage.length; i++) {
      if (placemarksStorage[i].address === address) {
        coords = placemarksStorage[i].coords;

        break;
      }
    }

    document.querySelector('.ymaps-2-1-73-balloon__close').dispatchEvent(new Event('click'))

    inputBlock.style.left = `${event.clientX}px`;
    inputBlock.style.top = `${event.clientY}px`;
    inputBlock.style.display = 'flex';

    fixInputView(event.clientX, event.clientY);
  }

  function openInputOnPlacemarkClicked(event) {
    let inputPositionX = `${event.getSourceEvent().originalEvent.domEvent.originalEvent.clientX}px`;
    let inputPositionY = `${event.getSourceEvent().originalEvent.domEvent.originalEvent.clientY}px`;
    let objId = event.get('objectId');
    let placemarksStorage = JSON.parse(localStorage.placemarksStorage);

    // ищем адрес/кординаты метке по её objId
    for (let i = 0; i < placemarksStorage.length; i++) {
      if (placemarksStorage[i].objId === objId) {
        coords = placemarksStorage[i].coords;
        inputHeaderText.innerText = placemarksStorage[i].address;
        getFeedbacksForAdress(placemarksStorage[i].address);
      }
    }

    inputBlock.style.left = inputPositionX;
    inputBlock.style.top = inputPositionY;
    inputBlock.style.display = 'flex';
    fixInputView(parseInt(inputPositionX), parseInt(inputPositionY));
  }

  function openInputOnMapClicked(event) {
    let inputPositionX = `${event.getSourceEvent().originalEvent.domEvent.originalEvent.clientX}px`;
    let inputPositionY = `${event.getSourceEvent().originalEvent.domEvent.originalEvent.clientY}px`;

    coords = event.get('coords');

    // закрываем попап со старыми отзывами и адресом в заголовке
    // позже покажем попап уже с новым адресом/отзывами
    inputBlock.style.display = 'none';

    inputBlock.style.left = inputPositionX;
    inputBlock.style.top = inputPositionY;
    getClickLocation(coords)
      .then(result => {
        address = result;
        inputHeaderText.innerText = address
      })
      .then(() => {
        getFeedbacksForAdress(address);
        inputBlock.style.display = 'flex';
        fixInputView(parseInt(inputPositionX), parseInt(inputPositionY));
      })
  }

  // функция, которая не дает уйти инпуту за пределы window
  // должна вызываться после установления display: flex
  // так как при display: none параметры height/width/top/left = 0
  function fixInputView(positionX, positionY, ...rest) {
    let inputBlockWidth = inputBlock.getBoundingClientRect().width;
    let inputBlockHeight = inputBlock.getBoundingClientRect().height;
    let inputBlockLeft = inputBlock.getBoundingClientRect().left;
    let inputBlockTop = inputBlock.getBoundingClientRect().top;

    // используем вычисленный ранее сдвиг позиции события относительно позиции элемента
    // и используем данную функцию при перетаскивании инпута, либо если сдвиг не задан, вычисляем его
    let shiftX = rest[0] || positionX - inputBlockLeft;
    let shiftY = rest[1] || positionY - inputBlockTop;

    // и реальную позицию элемента с учетом этого сдвига
    let Xcoord = positionX - shiftX;
    let Ycoord = positionY - shiftY;

    // не даем утянуть блок выше/ниже окна браузера
    if (Xcoord < 0) {
      Xcoord = 0;
    } else if (Xcoord + inputBlockWidth > window.innerWidth) {
      Xcoord = window.innerWidth - inputBlockWidth;
    }
    // не даем утянуть блок левее/правее окна браузера
    if (Ycoord < 0) {
      Ycoord = 0;
    } else if (Ycoord + inputBlockHeight > window.innerHeight) {
      Ycoord = window.innerHeight - inputBlockHeight;
    }

    inputBlock.style.left = Xcoord + 'px';
    inputBlock.style.top = Ycoord + 'px';
  }

  function formatDate(date) {
    let dd = date.getDate();
    let mm = date.getMonth() + 1;
    let yy = date.getFullYear() % 100;

    if (dd < 10) {
      dd = '0' + dd;
    }
    if (mm < 10) {
      mm = '0' + mm;
    }
    if (yy < 10) {
      yy = '0' + yy;
    }

    return dd + '.' + mm + '.' + yy;
  }

  // формирование li-шки отзыва в окно инпута при открытии его для уже существующих меток
  function formFeedbackItem(placemarkDataObj) {
    let item = document.createElement('li');

    item.classList.add('map-input__feedback-item');
    item.innerHTML = `
    <div class="map-input__feedback-text">
      <div class="map-input__feedback-name">${placemarkDataObj.feedback.inputName}</div>
      <div class="map-input__feedback-place">${placemarkDataObj.feedback.inputPlace}</div>
      <div class="map-input__feedback-date">${placemarkDataObj.feedback.inputDate}</div>
    </div>
    <div class="map-input__feedback-text">${placemarkDataObj.feedback.inputFeedback}</div>`

    return item;
  }

  function getFeedbacksForAdress(address) {
    if (localStorage.placemarksStorage) {
      inputFeedbackList.innerHTML = ''
      let placemarksStorage = JSON.parse(localStorage.placemarksStorage);
      let isFeedbackExistsForAddress = false

      for (let i = 0; i < placemarksStorage.length; i++) {
        if (placemarksStorage[i].address === address) {
          let feedbackItem = formFeedbackItem(placemarksStorage[i]);

          isFeedbackExistsForAddress = true
          inputFeedbackList.appendChild(feedbackItem);
        }
      }

      if (!isFeedbackExistsForAddress) {
        inputFeedbackList.innerHTML = 'Пока отзывов нету'
      }

    } else {
      inputFeedbackList.innerHTML = 'Пока отзывов нету'
    }
  }

  // вешаем возможность перетаскивать инпут 
  (function drag(elem) {
    let elemHeader = elem.querySelector('.map-input__header');

    elemHeader.onmousedown = function (e) {
      let coords = getCoords(elem);
      // вычисляем сдвиг позиции события относительно позиции элемента
      let shiftX = e.pageX - coords.left;
      let shiftY = e.pageY - coords.top;

      document.onmousemove = function (e) {
        fixInputView(e.pageX, e.pageY, shiftX, shiftY)
      };

      document.onmouseup = function () {
        document.onmousemove = null;
      };
    };

    elemHeader.ondragstart = function () {
      return false;
    };

    function getCoords(elem) {
      let box = elem.getBoundingClientRect();

      return {
        top: box.top + pageYOffset,
        left: box.left + pageXOffset
      };
    }
  })(inputBlock)
}

