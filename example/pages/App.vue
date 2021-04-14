<template>
  <div id="app">
    <img alt="Vue logo" :src="require('@/assets/logo.png')" />
    <HelloWorld msg="Welcome to Your Vue.js App" />
  </div>
</template>

<script>
import HelloWorld from '@/components/HelloWorld.vue';

export default {
  name: 'App',
  components: {
    HelloWorld,
  },
};
</script>

<style src="./app.less" lang="less"></style>
