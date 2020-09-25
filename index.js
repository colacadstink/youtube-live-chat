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
  }
  
  getLive() {
    const url = 'https://www.googleapis.com/youtube/v3/search'+
        '?eventType=live'+
        '&part=id'+
        `&channelId=${this.id}`+
        '&type=video'+
        `&key=${this.key}`
    this.request(url, data => {
      if (!data.items[0]) {
        this.emit('error', YouTube.CANNOT_FIND_LIVE)
      } else if (data.items.length > 1) {
        this.emit('multilive', data.items, (item) => {
          this.liveId = item.id.videoId
          this.getChatId()
        })
      } else {
        this.liveId = data.items[0].id.videoId
        this.getChatId()
      }
    })
  }
  
  getChatId() {
    if (!this.liveId) return this.emit('error', 'Live id is invalid.')
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
    })
  }
  
  /**
   * Gets live chat messages.
   * See {@link https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list#response|docs}
   * @return {object}
   */
  getChat() {
    if (!this.chatId) return this.emit('error', 'Chat id is invalid.')
    const url = 'https://www.googleapis.com/youtube/v3/liveChat/messages'+
        `?liveChatId=${this.chatId}`+
        '&part=id,snippet,authorDetails'+
        '&maxResults=2000'+
        `&key=${this.key}`
    this.request(url, data => {
      this.emit('json', data)
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
    let lastRead = 0, time = 0
    this.active = true
    this.getChat()
    this.interval = setInterval(() => this.getChat(), delay)
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
          if (!ignoreOld) {
            // Only emit if we're not ignoring things
            this.emit('message', item)
          }
        }
      }
      ignoreOld = false // Always listen after the first run no matter what
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
