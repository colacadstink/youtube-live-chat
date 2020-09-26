const {EventEmitter} = require('events')
const fetch = require('node-fetch')

/**
 * The main hub for acquire live chat with the YouTube Date API.
 * @extends {EventEmitter}
 */
class YouTube extends EventEmitter {
  static CANNOT_FIND_LIVE = 'Cannot find live.'
  active = false
  
  /**
   * @param {string} channelId ID of the channel to acquire with
   * @param {string} apiKey Your API key
   */
  constructor(channelId, apiKey) {
    super()
    this.id = channelId
    this.key = apiKey
    this.getLive()
  
    let lastRead = 0, time = 0
    this.on('json', data => {
      for (const item of data.items) {
        time = new Date(item.snippet.publishedAt).getTime()
        if (lastRead < time) {
          lastRead = time
          /**
           * Emitted whenever a new message is received.
           * See {@link https://developers.google.com/youtube/v3/live/docs/liveChatMessages#resource|docs}
           * @event YouTube#message
           * @type {object}
           */
          if (!this.ignoreOld) {
            // Only emit if we're not ignoring things
            this.emit('message', item)
          }
        }
      }
      this.ignoreOld = false // Always listen after the first run no matter what
    })
  }
  
  getLive() {
    const url = 'https://www.googleapis.com/youtube/v3/search'+
        '?eventType=live'+
        '&part=id'+
        `&channelId=${this.id}`+
        '&type=video'+
        `&key=${this.key}`
    
    return new Promise((resolve) => {
      this.request(url, data => {
        if (!data.items[0]) {
          this.emit('error', YouTube.CANNOT_FIND_LIVE)
          resolve()
        } else if (data.items.length > 1) {
          this.emit('multilive', data.items, (item) => {
            this.liveId = item.id.videoId
            resolve(this.getChatId())
          })
        } else {
          this.liveId = data.items[0].id.videoId
          resolve(this.getChatId())
        }
      })
    })
  }
  
  getChatId() {
    return new Promise((resolve) => {
      if (!this.liveId) {
        this.emit('error', 'Live id is invalid.')
        resolve()
      }
      const url = 'https://www.googleapis.com/youtube/v3/videos'+
          '?part=liveStreamingDetails'+
          `&id=${this.liveId}`+
          `&key=${this.key}`
      this.request(url, data => {
        if (!data.items.length)
          this.emit('error', 'Can not find chat.')
        else {
          this.chatId = data.items[0].liveStreamingDetails.activeLiveChatId
          this.emit('ready')
        }
        resolve()
      })
    })
  }
  
  /**
   * Gets live chat messages.
   * See {@link https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list#response|docs}
   * @return {object}
   */
  getChat() {
    return new Promise((resolve) => {
      if (!this.chatId) {
        this.emit('error', 'Chat id is invalid.')
        resolve(false)
      }
      const url = 'https://www.googleapis.com/youtube/v3/liveChat/messages'+
          `?liveChatId=${this.chatId}`+
          '&part=id,snippet,authorDetails'+
          '&maxResults=2000'+
          `&key=${this.key}`
      this.request(url, data => {
        this.emit('json', data)
        resolve(true)
      })
    })
  }

  request(url, callback) {
    fetch(url)
      .then(res => {
        if (res.ok) {
          return res.json()
        } else {
          this.emit('error', res)
        }
      })
      .then(json => {
        callback(json)
      })
      .catch(err => {
        this.emit('error', err)
      })
  }
  
  /**
   * Gets live chat messages at regular intervals.
   * @param {number} delay Interval to get live chat messages
   * @param {boolean} ignoreOld Should we ignore all messages sent before we started?
   * @fires YouTube#message
   */
  listen(delay, ignoreOld) {
    this.ignoreOld = ignoreOld
    this.getChat().then((isHappy) => {
      if (isHappy) {
        this.active = true
        this.interval = setInterval(() => this.getChat(), delay)
      }
    })
  }
  
  /**
   * Stops getting live chat messages at regular intervals.
   */
  stop() {
    this.active = false
    clearInterval(this.interval)
  }
}

module.exports = YouTube
