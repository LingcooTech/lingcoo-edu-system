import { navigateToWebPath } from '../../utils/format';

Component({
  properties: {
    blocks: {
      type: Array,
      value: [],
    },
    variant: {
      type: String,
      value: '',
    },
  },
  methods: {
    onCtaTap(event: { currentTarget: { dataset: { link?: string } } }) {
      navigateToWebPath(event.currentTarget.dataset.link || '');
    },
    onPreviewImage(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
      const url = event.currentTarget.dataset.url;
      const urls = event.currentTarget.dataset.urls || (url ? [url] : []);
      if (url && urls.length) {
        wx.previewImage({ urls, current: url });
      }
    },
  },
});
