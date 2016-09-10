'use strict'

const path = require('path')
const fs = require('fs')
const Promise = require('bluebird')

const express = require('express')

const {
  postsDir,
  bundleLoc
} = require('../config.js')
const marked = require('../lib/marked.js')

// Generate bundleRender from webpack bundle code
const code = fs.readFileSync(bundleLoc)
const bundleRenderer = require('vue-server-renderer').createBundleRenderer(code)

const template = fs.readFileSync(path.resolve(__dirname, './template.html'), 'utf-8')
const i = template.indexOf('{{ APP }}')
const head = template.slice(0, i)
const tail = template.slice(i + '{{ APP }}'.length)

const app = express()
app.use(express.static(path.resolve(__dirname, '../../dist')))

const posts = fs.readdirSync(postsDir)

const postToStream = (context, outStream) => {
  const renderStream = bundleRenderer.renderToStream(context)

  outStream.write(head.replace('{{ STYLE }}', `
      <style>
        ${fs.readFileSync(path.resolve(__dirname, '../css/global.css'))}
      </style>
      <link rel="stylesheet" href="/styles.css">`))

  renderStream.on('error', (err) => console.log('ERROR: ', err))
  renderStream.on('data', chunk => outStream.write(chunk))

  renderStream.on('end', () => outStream.end(tail))

  return outStream
}

app.get('/blog', (req, res) => {
  res.set('Content-Type', 'text/html')
  postToStream({
    type: 'home',
    postsDir
  }, res)
})

app.get('/blog/:post', (req, res) => {
  res.set('Content-Type', 'text/html')
  postToStream({
    post: req.params.post + '.md',
    filepath: path.resolve(__dirname, '../../_posts', req.params.post + '.md')
  }, res)
})

app.get('/api/allposts', (req, res) => {
  fs.readdir(postsDir, (err, files) => {
    Promise.map(files, (file) => new Promise((resolve, reject) => {
      const fullPost = fs.readFileSync(postsDir + '/' + file, 'utf-8')
      const preview = fullPost.split('\n').slice(0, 22).join('\n')

      marked({ file: postsDir + '/' + file, summary: true }).then((content) => {
        resolve({
          title: file.replace(/\.md$/, ''),
          attributes: content.attributes,
          summary: content.body
        })
      })
    }))
    .then((posts) => {
      // sort from latest to oldest
      const dated = {}
      const newPosts = []
      posts.forEach((post, i) => {
        dated[Date.parse(post.attributes.date)] = i
      })
      Object.keys(dated).sort().reverse().forEach((key, i) => {
        newPosts[i] = posts[dated[key]]
      })

      return Promise.resolve(newPosts)
    })
    .then((posts) => {
      res.send(posts)
      // Home.data = () => ({
      //   posts
      // })

      // resolve(new Vue(Home))
    })
  })
})

app.listen(3001)
console.log('Listening on 3001')

