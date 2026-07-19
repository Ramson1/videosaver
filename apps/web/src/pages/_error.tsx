function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>{statusCode ? `${statusCode} Error` : 'Error'}</h1>
      <p>{statusCode ? 'An error occurred on the server.' : 'An error occurred on the client.'}</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode: number }; err?: { statusCode: number } }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
