Module.register('MMM-CalendarExt3Journal', {
  defaults: {
    height: '800px',
    width: '100%',
    instanceId: null,
    locale: null,
    staticWeek: false,
    dayIndex: 0,
    days: 3,
    staticTime: true,
    beginHour: 8,
    hourLength: 4,
    hourIndexOptions: {
      hour: 'numeric',
      minute: '2-digit',
    },
    dateHeaderOptions: {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    },
    eventDateOptions: {
      dateStyle: 'short',
    },
    eventTimeOptions: {
      timeStyle: 'short',
    },
    refreshInterval: 1000 * 60 * 10,
    waitFetch: 1000 * 5,
    animationSpeed: 1000,
    animatedIn: null, // reserved
    animatedOut: null, // reserved
    calendarSet: [],
    eventFilter: null,
    eventTransformer: null,
    preProcessor: null,
    useSymbol: true,
    notification: 'CALENDAR_EVENTS',
    //maxIntersect: 3, // max number of events to show in a column
    //displayLegend: false,
    firstDayOfWeek: null,
    minimalDaysOfNewYear: null,
    weekends: [],
    useIconify: false,
    enableEventPopup: true,
    popupShowFields: ['title', 'time', 'location', 'description', 'calendar'],
    popupDateTimeOptions: {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  },


  getStyles: function () {
    return ['MMM-CalendarExt3Journal.css']
  },

  start: function () {
    this.nowTimer = null
    this.activePopup = null
    this.popupCloseHandler = null
    this.config.locale = Intl.getCanonicalLocales(this.config.locale ?? config.language)?.[0] ?? 'en-US'
    this.config.instanceId = this.config?.instanceId ?? this.identifier
    this.config.hourLength = Math.ceil((this.config.hourLength <= 1) ? 6 : this.config.hourLength)
    this._ready = false
    if (this.config.staticWeek) {
      this.config.days = 7
      this.config.dayIndex = 0
    }

    const calInfo = new Intl.Locale(this.config.locale)
    if (!calInfo?.weekInfo) Log.log('[CX3J] WeekInfo is not available in Intl.Locale, You may need to fulfill `firstDayOfWeek`, `minimalDaysOfNewYear` and `weekends` manually.')
    this.config.firstDayOfWeek = ((this.config.firstDayOfWeek !== null) ? this.config.firstDayOfWeek : (calInfo?.weekInfo?.firstDay ?? 1)) % 7
    this.config.minimalDaysOfNewYear = (this.config.minimalDaysOfNewYear !== null) ? this.config.minimalDaysOfNewYear : (calInfo?.weekInfo?.minimalDays ?? 4)
    this.config.weekends = ((Array.isArray(this.config.weekends) && this.config.weekends?.length) ? this.config.weekends : (calInfo?.weekInfo?.weekend ?? [])).map(d => d % 7)


    this.activeConfig = { ...this.config }
    this.originalConfig = { ...this.activeConfig }
    let _moduleLoaded = new Promise((resolve, reject) => {
      import('/' + this.file('CX3_Shared/CX3_shared.mjs')).then((m) => {
        this.library = m
        this.library.initModule(this, config.language)
        if (this.config.useIconify) this.library.prepareIconify()
        resolve()
      }).catch((err) => {
        Log.error(err)
        reject(err)
      })
    })

    let _firstData = new Promise((resolve, reject) => {
      this._receiveFirstData = resolve
    })

    let _firstFetched = new Promise((resolve, reject) => {
      this._firstDataFetched = resolve
    })

    let _domCreated = new Promise((resolve, reject) => {
      this._domReady = resolve
    })

    Promise.allSettled([_moduleLoaded, _firstData, _domCreated]).then((result) => {
      this._ready = true
      this.library.prepareMagic()
      let { payload, sender } = result[1].value
      this.fetch(payload, sender, this.activeConfig)
      this._firstDataFetched()
    })

    Promise.allSettled([_firstFetched]).then(() => {
      setTimeout(() => {
        this.updateView({ ...this.activeConfig })
      }, this.config.waitFetch)
    })
  },


  notificationReceived: function (notification, payload, sender) {
    if (notification === this.config.notification) {
      this.fetch(payload, sender, this.activeConfig)
    }

    if (notification === 'DOM_OBJECTS_CREATED') {
      this._domReady()
    }

    if (notification === 'CX3J_CONFIG') {
      this.activeConfig = { ...this.activeConfig, ...payload }
      this.updateView({ ...this.activeConfig })
    }

    if (notification === 'CX3J_RESET') {
      this.activeConfig = { ...this.originalConfig }
      this.updateView({ ...this.activeConfig })
    }
  },

  fetch: function (payload, sender, options) {
    this.eventPool.set(sender.identifier, JSON.parse(JSON.stringify(payload)))
    this.updateView(options)
  },

  updateView: function (options) {
    clearTimeout(this.timer)
    this.timer = null
    this.updateDom(this.config.animationSpeed)

    if (options?.refreshInterval) {
      this.timer = setTimeout(() => {
        this.updateView(options)
      }, options.refreshInterval)
    }
  },

  getDom: function () {
    let dom = document.createElement('div')
    dom.classList.add('bodice', 'CX3J_' + this.activeConfig.instanceId, 'CX3J')
    dom.style.setProperty('--moduleHeight', this.activeConfig.height)
    dom.style.setProperty('--moduleWidth', this.activeConfig.width)
    dom = this.drawBoard(dom, this.activeConfig)

    return dom
  },

  drawBoard: function (dom, options) {
    if (!this.library?.loaded) return dom

    const { getBeginOfWeek, isToday, isThisMonth, isThisYear, isWeekend } = this.library
    const { beginHour, staticWeek, dayIndex, days, staticTime, hourLength } = options
    let today = new Date()

    let startDay = (staticWeek)
      ? getBeginOfWeek(today, options)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayIndex)
    let startHour = new Date(
      startDay.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
      (staticTime) ? beginHour : today.getHours() + beginHour,
    )

    const assignDayClass = (dom, day, options) => {
      if (isToday(day)) dom.classList.add('today')
      if (isThisMonth(day)) dom.classList.add('thisMonth')
      if (isThisYear(day)) dom.classList.add('thisYear')
      const weekends = isWeekend(day, options)
      if (weekends > -1) dom.classList.add('weekend', 'weekend_' + (weekends + 1))

      dom.dataset.isoString = day.toISOString()
      dom.dataset.dateValue = day.valueOf()
      dom.dataset.dateString = new Date(day.valueOf()).toISOString().split('T')[0]
      return dom
    }

    const assignGridClass = (dom, m, options) => {
      dom.dataset.isoString = m.toISOString()
      if (isToday(m)) dom.classList.add('today')
      if (isThisMonth(m)) dom.classList.add('thisMonth')
      if (isThisYear(m)) dom.classList.add('thisYear')
      const weekends = isWeekend(m, options)
      if (weekends > -1) dom.classList.add('weekend', 'weekend_' + (weekends + 1))
      dom.dataset.hour = m.getHours()
      dom.dataset.minute = m.getMinutes()
      return dom
    }

    const board = document.createElement('div')
    board.classList.add('board')
    board.style.setProperty('--days', days)

    const headerContainer = document.createElement('div')
    headerContainer.classList.add('headerContainer')
    headerContainer.style.setProperty('--days', days)

    const headerBackground = document.createElement('div')
    headerBackground.classList.add('headerBackground')
    for (let i = 0; i < days; i++) {
      let d = new Date(startDay.valueOf())
      d.setDate(d.getDate() + i)
      let daybackground = document.createElement('div')
      daybackground.classList.add('dayBackground')
      daybackground = assignDayClass(daybackground, d, options)
      headerBackground.appendChild(daybackground)
    }

    headerContainer.appendChild(headerBackground)


    const header = document.createElement('div')
    header.classList.add('header')
    for (let i = 0; i < days; i++) {
      let day = new Date(startDay.valueOf())
      day.setDate(day.getDate() + i)
      let dayDom = document.createElement('div')
      dayDom.classList.add('daycell')
      dayDom = assignDayClass(dayDom, day, options)
      dayDom.innerHTML = new Intl.DateTimeFormat(options.locale, options.dateHeaderOptions).formatToParts(day)
        .reduce((prev, cur, curIndex, arr) => {
          prev = prev + `<span class="dayTimeParts ${cur.type} seq_${curIndex}">${cur.value}</span>`
          return prev
        }, '')
      header.appendChild(dayDom)
    }

    const feSection = document.createElement('div')
    feSection.classList.add('fulldayEvents')

    header.appendChild(feSection)
    headerContainer.appendChild(header)
    board.appendChild(headerContainer)


    const main = document.createElement('div')
    main.classList.add('main')
    main.style.setProperty('--periods', hourLength * 2)

    const halfHour = 30

    const now = [today.getHours(), (today.getMinutes() < halfHour) ? true : false]
    for (let i = 0; i < (hourLength * 2); i++) {
      let even = (i % 2 === 0)
      let pm = new Date(startHour.getTime())
      pm.setMinutes(startHour.getMinutes() + (i * halfHour))
      const current = (pm.getHours() === now[0] && even === now[1])
      const index = document.createElement('div')
      index.classList.add('index', 'gridCell', (even) ? 'even' : 'odd', (current) ? 'now' : 'notnow')
      index.innerHTML = new Intl.DateTimeFormat(options.locale, options.hourIndexOptions).formatToParts(pm)
        .reduce((prev, cur, curIndex, arr) => {
          prev = prev + `<span class="indexTimeParts ${cur.type} seq_${curIndex} ${cur.type}">${cur.value}</span>`
          return prev
        }, '')
      index.dataset.isoString = pm.toISOString()
      index.dataset.hour = pm.getHours()
      index.dataset.minute = pm.getMinutes()
      main.appendChild(index)

      for (let j = 0; j < days; j++) {
        let cm = new Date(pm.valueOf())
        cm.setDate(cm.getDate() + j)
        let cell = document.createElement('div')
        cell.classList.add('cell', 'gridCell', (even) ? 'even' : 'odd', (current) ? 'now' : 'notnow')
        if (i === 0) cell.classList.add('first')
        if (i === (hourLength * 2) - 1) cell.classList.add('last')
        cell = assignGridClass(cell, cm, options)
        main.appendChild(cell)
      }
    }

    const drawNowIndicator = (main, options) => {
      clearTimeout(this.nowTimer)
      this.nowTimer = null
      let nowHeight = 0;
      let nowIndicator = main.querySelector('.nowIndicator')
      if (!nowIndicator) {
        nowIndicator = document.createElement('div')
        nowIndicator.classList.add('nowIndicator')
        main.appendChild(nowIndicator)
      }

      const now = new Date()

      const rangeStartHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour.getHours())
      const rangeEndHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour.getHours() + hourLength)
      const rangeStartHourValue = rangeStartHour.valueOf()
      const rangeEndHourValue = rangeEndHour.valueOf()
      nowIndicator.classList.add('nowIndicator')
      if (now.valueOf() < rangeStartHourValue) {
        nowHeight = 0
      } else if (now.valueOf() > rangeEndHourValue) {
        nowHeight = 100
      } else {
        nowHeight = (now.valueOf() - rangeStartHourValue) / (rangeEndHourValue - rangeStartHourValue) * 100
      }
      nowIndicator.style.setProperty('--nowHeight', nowHeight + '%')
      nowIndicator.dataset.time = new Intl.DateTimeFormat(options.locale, options.eventTimeOptions).format(now)

      this.nowTimer = setTimeout(() => {
        drawNowIndicator(main, options)
      }, 1000 * 10)
    }

    drawNowIndicator(main, options)


    board.appendChild(main)

    dom.appendChild(board)
    this.drawEvents(dom, options, { startDay, startHour })
    return dom
  },

  drawEvents: function (dom, options, startObj) {
    if (!this.library?.loaded) return dom
    const { regularizeEvents, renderEventJournal, renderEventAgenda } = this.library

    const targetEvents = regularizeEvents({
      eventPool: this.eventPool,
      config: options,
    })

    const { fullday, single } = this.regularize(targetEvents, options, startObj)

    const periods = Array.from(dom.querySelectorAll('.cell')).map(cell => cell.dataset.isoString)
    for (let event of single) {
      if (event?.skip) continue
      let startPoint = new Date(+event.vStartDate)
      startPoint.setMinutes((startPoint.getMinutes() < 30) ? 0 : 30)
      startPoint.setSeconds(0)
      startPoint.setMilliseconds(0)
      let matchedPeriod = periods.find(period => period === startPoint.toISOString())
      if (!matchedPeriod) continue
      let cell = dom.querySelector(`.cell[data-iso-string="${matchedPeriod}"]`)
      if (!cell) continue

      let cellDate = new Date(matchedPeriod)
      let height = event.vDuration / (1000 * 60 * 30)
      let eDom = renderEventJournal(event, options, cellDate)
      eDom.classList.add('single')
      eDom.style.setProperty('--eventHeight', height)
      eDom.style.setProperty('--eventTop', (((new Date(+event.vStartDate)).getMinutes() % 30) / 30 * 100) + "%")
      eDom.style.setProperty('--intersect', event.intersect)
      if (event?.continueFromPrev) eDom.classList.add('continueFromPrev')
      if (event?.continueToNext) eDom.classList.add('continueToNext')
      if (options.enableEventPopup) {
        eDom.style.cursor = 'pointer'
        eDom.addEventListener('click', (e) => {
          e.stopPropagation()
          this.showEventPopup(eDom, options)
        })
      }
      cell.appendChild(eDom)
    }

    const dateRange = Array.from(dom.querySelectorAll('.daycell')).map((cell, index) => {
      const t = new Date(+cell.dataset.dateValue)
      return {
        index,
        date: new Date(t.getFullYear(), t.getMonth(), t.getDate())
      }
    })

    const fsDom = dom.querySelector('.fulldayEvents')
    for (let event of fullday) {
      if (event?.skip) continue
      let startDate = new Date(+event.startDate)
      let endDate = new Date(+event.endDate)
      let startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      let endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

      if (!options.staticWeek) {
        for (let dr of dateRange) {
          if (dr.date.valueOf() >= startDay.valueOf() && dr.date.valueOf() < endDay.valueOf()) {
            let eDom = renderEventAgenda(event, options)
            eDom.classList.add('notsingle')
            eDom.style.setProperty('--eventStart', dr.index + 1)
            eDom.style.setProperty('--eventEnd', dr.index + 2)
            if (options.enableEventPopup) {
              eDom.style.cursor = 'pointer'
              eDom.addEventListener('click', (e) => {
                e.stopPropagation()
                this.showEventPopup(eDom, options)
              })
            }
            fsDom.appendChild(eDom)
          }
        }
      } else {
        let startIndex = (dateRange.find((d) => d.date.valueOf() === startDay.valueOf())?.index ?? 0) + 1
        let endIndex = (dateRange.find((d) => d.date.valueOf() === endDay.valueOf())?.index ?? -3) + 2
        if (startIndex === endIndex) endIndex++ // Fix for zero-length or single-day span issue in grid logic if relevant, though logic usually ensures start < end
        let eDom = renderEventAgenda(event, options)
        eDom.classList.add('notsingle')
        eDom.style.setProperty('--eventStart', startIndex)
        eDom.style.setProperty('--eventEnd', endIndex)
        if (options.enableEventPopup) {
          eDom.style.cursor = 'pointer'
          eDom.addEventListener('click', (e) => {
            e.stopPropagation()
            this.showEventPopup(eDom, options)
          })
        }
        fsDom.appendChild(eDom)
      }
    }
    return dom
  },

  regularize: function (events, options, { startDay, startHour }) {
    const { eventsByDate, prepareEvents, calendarFilter } = this.library

    const startDateWindow = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate())
    const endDateWindow = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + parseInt(options.days))

    const prepared = prepareEvents({
      targetEvents: calendarFilter(events, options.calendarSet),
      config: options,
      range: [startDateWindow.valueOf(), endDateWindow.valueOf()],
    })

    const [fulldayEvents, singleEvents] = prepared.reduce(([fulldayEvents, singleEvents], event) => { // eslint-disable-line no-unused-vars
      if (event.isFullday || event.isMultiday) {
        fulldayEvents.push({ ...event })
      } else {
        singleEvents.push({ ...event })
      }
      return [fulldayEvents, singleEvents]
    }, [[], []])

    const result = eventsByDate({
      targetEvents: singleEvents,
      config: options,
      startTime: startDay,
      dayCounts: options.days,
    })

    let regularized = []
    for (let { date, events } of result) {
      const singleRanged = []
      let day = new Date(date)
      let rangeStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour.getHours())
      let rangeEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour.getHours() + options.hourLength)
      events.forEach((orev) => {
        const event = { ...orev }
        if (event.isFullday) return
        let startDate = new Date(+event.startDate)
        let endDate = new Date(+event.endDate)
        if (startDate.valueOf() >= rangeEnd.valueOf() || endDate.valueOf() <= rangeStart.valueOf()) return

        if (startDate.valueOf() < rangeStart.valueOf()) {
          event.vStartDate = rangeStart.valueOf()
          event.continueFromPrev = true
        } else {
          event.vStartDate = event.startDate
        }
        if (endDate.valueOf() > rangeEnd.valueOf()) {
          event.vEndDate = rangeEnd.valueOf()
          event.continueToNext = true
        } else {
          event.vEndDate = event.endDate
        }
        event.vDuration = +event.vEndDate - +event.vStartDate
        event.intersect = 0
        singleRanged.push({ ...event })
      })
      singleRanged.sort((a, b) => {
        // sort by 'duration' desc first then 'startDate' asc
        if (a.vStartDate > b.vStartDate) return 1
        if (a.vStartDate < b.vStartDate) return -1
        if (a.vEndDate > b.vEndDate) return 1
        if (a.vEndDate < b.vEndDate) return -1
        return 0
      })
      for (let i = 0; i < singleRanged.length; i++) {
        let event = singleRanged[i]
        for (let j = i + 1; j < singleRanged.length; j++) {
          let compare = singleRanged[j]
          if (compare.vStartDate >= event.vEndDate || compare.vEndDate <= event.vStartDate) continue
          compare.intersect++
        }
      }
      regularized = [...regularized, ...singleRanged]
    }

    return {
      fullday: fulldayEvents,
      single: regularized,
    }
  },

  createEventPopup: function (eventElement, options) {
    const data = {
      title: eventElement.dataset.title || '',
      description: eventElement.dataset.description || '',
      location: eventElement.dataset.location || '',
      calendarName: eventElement.dataset.calendarName || '',
      startDate: eventElement.dataset.startDate ? parseInt(eventElement.dataset.startDate) : null,
      endDate: eventElement.dataset.endDate ? parseInt(eventElement.dataset.endDate) : null,
      isFullday: eventElement.dataset.fullDayEvent === 'true',
      symbol: eventElement.dataset.symbol || '',
      color: eventElement.dataset.color || '',
    }

    const backdrop = document.createElement('div')
    backdrop.classList.add('CX3J_eventPopupBackdrop')

    const modal = document.createElement('div')
    modal.classList.add('CX3J_eventPopupModal')
    modal.style.setProperty('--animationSpeed', options.animationSpeed)

    const card = document.createElement('div')
    card.classList.add('CX3J_eventPopupCard')
    if (data.color) {
      card.style.setProperty('--eventColor', data.color)
    }

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.classList.add('CX3J_eventPopupClose')
    closeBtn.innerHTML = '×'
    closeBtn.setAttribute('aria-label', 'Close')
    card.appendChild(closeBtn)

    // Header with symbol and title
    if (options.popupShowFields.includes('title') && data.title) {
      const header = document.createElement('div')
      header.classList.add('CX3J_eventPopupHeader')

      if (data.symbol && options.useSymbol) {
        const symbolSpan = document.createElement('span')
        symbolSpan.classList.add('CX3J_eventPopupSymbol')
        symbolSpan.innerHTML = data.symbol
        header.appendChild(symbolSpan)
      }

      const titleDiv = document.createElement('div')
      titleDiv.classList.add('CX3J_eventPopupTitle')
      titleDiv.textContent = data.title
      header.appendChild(titleDiv)

      card.appendChild(header)
    }

    const content = document.createElement('div')
    content.classList.add('CX3J_eventPopupContent')

    // Time field
    if (options.popupShowFields.includes('time') && data.startDate) {
      const timeRow = document.createElement('div')
      timeRow.classList.add('CX3J_eventPopupRow')

      const timeLabel = document.createElement('div')
      timeLabel.classList.add('CX3J_eventPopupLabel')
      timeLabel.textContent = 'Time'
      timeRow.appendChild(timeLabel)

      const timeValue = document.createElement('div')
      timeValue.classList.add('CX3J_eventPopupValue')

      const startDate = new Date(data.startDate)
      const endDate = data.endDate ? new Date(data.endDate) : null

      if (data.isFullday) {
        // Full day event - show date range
        const dateFormatter = new Intl.DateTimeFormat(options.locale, { dateStyle: options.popupDateTimeOptions.dateStyle })
        if (endDate) {
          const endDay = new Date(endDate)
          endDay.setDate(endDay.getDate() - 1) // Adjust for exclusive end date
          if (startDate.toDateString() === endDay.toDateString()) {
            timeValue.textContent = dateFormatter.format(startDate)
          } else {
            timeValue.textContent = `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDay)}`
          }
        } else {
          timeValue.textContent = dateFormatter.format(startDate)
        }
      } else {
        // Timed event
        const dateFormatter = new Intl.DateTimeFormat(options.locale, options.popupDateTimeOptions)
        if (endDate) {
          const sameDay = startDate.toDateString() === endDate.toDateString()
          if (sameDay) {
            const timeFormatter = new Intl.DateTimeFormat(options.locale, { timeStyle: options.popupDateTimeOptions.timeStyle })
            timeValue.textContent = `${dateFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`
          } else {
            timeValue.textContent = `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`
          }
        } else {
          timeValue.textContent = dateFormatter.format(startDate)
        }
      }

      timeRow.appendChild(timeValue)
      content.appendChild(timeRow)
    }

    // Location field
    if (options.popupShowFields.includes('location') && data.location) {
      const locationRow = document.createElement('div')
      locationRow.classList.add('CX3J_eventPopupRow')

      const locationLabel = document.createElement('div')
      locationLabel.classList.add('CX3J_eventPopupLabel')
      locationLabel.textContent = 'Location'
      locationRow.appendChild(locationLabel)

      const locationValue = document.createElement('div')
      locationValue.classList.add('CX3J_eventPopupValue')
      locationValue.textContent = data.location
      locationRow.appendChild(locationValue)

      content.appendChild(locationRow)
    }

    // Description field
    if (options.popupShowFields.includes('description') && data.description) {
      const descRow = document.createElement('div')
      descRow.classList.add('CX3J_eventPopupRow')

      const descLabel = document.createElement('div')
      descLabel.classList.add('CX3J_eventPopupLabel')
      descLabel.textContent = 'Description'
      descRow.appendChild(descLabel)

      const descValue = document.createElement('div')
      descValue.classList.add('CX3J_eventPopupValue')
      descValue.textContent = data.description
      descRow.appendChild(descValue)

      content.appendChild(descRow)
    }

    // Calendar field
    if (options.popupShowFields.includes('calendar') && data.calendarName) {
      const calRow = document.createElement('div')
      calRow.classList.add('CX3J_eventPopupRow')

      const calLabel = document.createElement('div')
      calLabel.classList.add('CX3J_eventPopupLabel')
      calLabel.textContent = 'Calendar'
      calRow.appendChild(calLabel)

      const calValue = document.createElement('div')
      calValue.classList.add('CX3J_eventPopupValue')
      calValue.textContent = data.calendarName
      calRow.appendChild(calValue)

      content.appendChild(calRow)
    }

    card.appendChild(content)
    modal.appendChild(card)
    backdrop.appendChild(modal)

    return { backdrop, modal, card, closeBtn }
  },

  showEventPopup: function (eventElement, options) {
    if (this.activePopup) {
      this.hideEventPopup()
    }

    const { backdrop, closeBtn } = this.createEventPopup(eventElement, options)
    document.body.appendChild(backdrop)

    // Trigger animation
    requestAnimationFrame(() => {
      backdrop.classList.add('show')
    })

    // Close handlers
    const closePopup = () => this.hideEventPopup()

    closeBtn.addEventListener('click', closePopup)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closePopup()
      }
    })

    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closePopup()
      }
    }
    document.addEventListener('keydown', escapeHandler)

    this.activePopup = backdrop
    this.popupCloseHandler = escapeHandler
  },

  hideEventPopup: function () {
    if (!this.activePopup) return

    const backdrop = this.activePopup
    backdrop.classList.remove('show')

    // Wait for animation to complete before removing
    setTimeout(() => {
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop)
      }
    }, this.activeConfig.animationSpeed)

    if (this.popupCloseHandler) {
      document.removeEventListener('keydown', this.popupCloseHandler)
      this.popupCloseHandler = null
    }

    this.activePopup = null
  }
})