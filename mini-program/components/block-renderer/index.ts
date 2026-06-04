import { navigateToWebPath } from '../../utils/format';

Component({
  properties: {
    blocks: {
      type: Array,
      value: [],
    },
  },
  methods: {
    onCtaTap(event: { currentTarget: { dataset: { link?: string } } }) {
      navigateToWebPath(event.currentTarget.dataset.link || '');
    },
  },
});
