<script>
import Footer from '@/components/form/Footer';
import LabeledInput from '@/components/form/LabeledInput';
import LabelsAndAnnosModal from '@/components/form/LabelsAndAnnosModal';
import NameNsDescription from '@/components/form/NameNsDescription';
import CreateEditView from '@/mixins/create-edit-view';
import { DESCRIPTION } from '@/config/labels-annotations';

const filesFormat = ['gz', 'qcow', 'qcow2', 'raw', 'img', 'xz', 'iso'];

export default {
  name: 'EditImage',

  components: {
    Footer,
    LabeledInput,
    LabelsAndAnnosModal,
    NameNsDescription,
  },

  mixins: [CreateEditView],

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  data() {
    let spec = this.value.spec;
    const description = this.value.metadata?.annotations?.[DESCRIPTION];

    if ( !this.value.spec ) {
      spec = {};

      this.$set(this.value, 'spec', spec);
    }

    if ( this.value.metadata ) {
      this.value.metadata.generateName = 'image-'; // back end needs
    }

    if (description) {
      // if description exist, copy it, then remove it from annotations
      this.$set(this.value.spec, 'description', description);
      this.value.setAnnotation(DESCRIPTION, null);
    }

    return { url: this.value.spec.url };
  },

  watch: {
    url(neu) {
      const url = neu.trim();
      const suffixName = url.split('/').pop();
      const fileSuffiic = suffixName.split('.').pop();

      this.value.spec.url = url;
      if (filesFormat.includes(fileSuffiic)) {
        if (!this.value.spec.displayName) {
          this.$refs.nd.changeNameAndNamespace({ text: suffixName });
        }
        this.errors = [];
      } else {
        this.errors = ['The URL you have entered ends in an extension that we do not support. We only accept image files that end in .img, .iso, .qcow2, .raw, and compressed (.tar, .gz, .xz) of the above formats).'];
      }
    },
  },

  created() {
    this.registerBeforeHook(this.validateBefore, 'validate');
    this.registerBeforeHook(this.willSave, 'willSave');
  },

  methods: {
    willSave() {
      // before save image, save description in annotations.
      this.value.setAnnotation(DESCRIPTION, this.value.spec.description);

      this.value.spec.description = undefined;
    },
    validateBefore() {
      if (!this.value.spec.url || this.value.spec.url.trim() === '') {
        this.errors = ['Please input image url!'];

        return false;
      }
    }
  }
};
</script>

<template>
  <form>
    <div class="row">
      <div class="col span-12">
        <NameNsDescription
          ref="nd"
          v-model="value"
          :namespaced="false"
          :mode="mode"
          label="Name"
          name-key="spec.displayName"
          description-key="spec.description"
        />
      </div>
    </div>

    <div class="row mb-20">
      <div class="col span-12">
        <LabeledInput
          v-model="url"
          :mode="mode"
          class="labeled-input--tooltip"
          required
        >
          <template #label>
            <label class="has-tooltip" :style="{'color':'var(--input-label)'}">
              Enter URL
              <i v-tooltip="t('vmimage.urlTip', {}, raw=true)" class="icon icon-info" style="font-size: 14px" />
            </label>
          </template>
        </LabeledInput>
      </div>
    </div>

    <LabelsAndAnnosModal v-model="value" :mode="mode" />
    <Footer :mode="mode" :errors="errors" @save="save" @done="done" />
  </form>
</template>

<style lang="scss" scoped>
.resize {
  resize: auto;
}
.tip {
  font-size: 13px;
  font-style: italic;
}
code {
  border-radius: 2px;
  color: #e96900;
  font-size: .8rem;
  margin: 0 2px;
  padding: 3px 5px;
  white-space: pre-wrap;
}
.label {
  color: var(--input-label);
}
</style>
