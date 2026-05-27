const { execSync } = require('child_process');

function ngAdd() {
  return (tree, context) => {
    context.logger.info('Running ngcompass init...');
    try {
      execSync('npx ngcompass init', { stdio: 'inherit' });
    } catch {
      context.logger.error('ngcompass init failed. Run "npx ngcompass init" manually to complete setup.');
    }
    return tree;
  };
}

exports.ngAdd = ngAdd;
